import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { prisma } from "@/lib/db/client";
import { AppError } from "@/lib/errors/exceptions";
import { normalizeDigits, normalizeMobile } from "@/lib/utils/digits";
import { parseWaybillDate } from "@/lib/waybills/date-parser";
import { calculateWaybillAmount } from "@/lib/waybills/amount";
import { createAuditLogEntry } from "@/lib/audit/audit-logger";
import { parseExcelBuffer, ExcelColumnMappingDefinition } from "./excel-parser";
import { ParsedRowResult } from "./schema";

export interface SerializedNormalizedData {
  rowNumber: number;
  driverName: string;
  driverMobile: string;
  waybillNumber: string;
  waybillYear?: number | null;
  rawExcelAmount: string;
  payableAmount: string;
  weight: number;
  issueDate: string;
  origin?: string | null;
  destination?: string | null;
  grossAmount?: string | null;
  commissionAmount?: string | null;
  deductionsAmount?: string | null;
  netAmount?: string | null;
  isSkippedPreviouslyCancelled?: boolean;
}

export interface ProcessImportFileInput {
  organizationId: string;
  filename: string;
  fileBuffer: Buffer;
  createdByUserId?: string;
  customMapping?: ExcelColumnMappingDefinition;
  applySurcharge?: boolean;
}

export interface ImportPreviewResult {
  batchId: string;
  filename: string;
  fileHash: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  skippedRows: number;
  sampleRows: ParsedRowResult[];
}

/**
 * Step 1-10: Ingests an Excel/CSV file, validates rows, checks idempotency and creates a preview batch.
 * Follows business-rules.md §4 & §5.
 */
export async function processImportFile(
  input: ProcessImportFileInput
): Promise<ImportPreviewResult> {
  const {
    organizationId,
    filename,
    fileBuffer,
    createdByUserId,
    customMapping,
    applySurcharge = true,
  } = input;

  // 1. Fetch organization settings for rounding and surcharge
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });

  const roundMultiple = settings?.roundMultiple ?? 50_000n;
  const surchargeAmount = settings?.surchargeAmount ?? 700_000n;
  const effectiveApplySurcharge =
    applySurcharge !== undefined
      ? applySurcharge
      : settings?.applySurchargeDefault ?? true;

  // 2. Compute SHA-256 file hash for idempotency check
  const fileHash = createHash("sha256").update(fileBuffer).digest("hex");

  const existingBatch = await prisma.importBatch.findFirst({
    where: { organizationId, fileHash },
  });

  if (existingBatch) {
    if (existingBatch.status === "COMMITTED") {
      throw new AppError(
        "IMPORT_ALREADY_PROCESSED",
        "این فایل اکسل قبلاً با موفقیت پردازش و ثبت نهایی شده است و امکان ورود مجدد آن وجود ندارد."
      );
    }
  }

  // 3. Parse Excel buffer
  const parsed = parseExcelBuffer(fileBuffer, filename, customMapping);

  // 4. Validate and normalize each row
  const rowResults: ParsedRowResult[] = [];
  let validCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (const rawRow of parsed.rows) {
    const rowNum = rawRow.__rowNumber as number;
    const errors: string[] = [];

    const driverName = String(rawRow.driverName ?? "").trim();
    const rawMobile = String(rawRow.driverMobile ?? "").trim();
    const waybillNumber = normalizeDigits(String(rawRow.waybillNumber ?? "").trim());
    const rawPayableStr = normalizeDigits(String(rawRow.payableAmount ?? "").trim());
    const rawWeightStr = normalizeDigits(String(rawRow.weight ?? "0").trim());
    const rawYearStr = normalizeDigits(String(rawRow.waybillYear ?? "").trim());
    const rawIssueDate = rawRow.issueDate;

    if (!driverName) errors.push("نام راننده نمی‌تواند خالی باشد.");
    if (!waybillNumber) errors.push("شماره بارنامه نمی‌تواند خالی باشد.");

    const normalizedMobile = normalizeMobile(rawMobile);
    if (!normalizedMobile) {
      errors.push(`شماره موبایل نامعتبر است: ${rawMobile}`);
    }

    // Parse amount
    let rawExcelAmount = 0n;
    try {
      const cleanAmt = rawPayableStr.replace(/,/g, "").replace(/\.0+$/, "");
      if (!cleanAmt || isNaN(Number(cleanAmt))) {
        errors.push(`مبلغ پرداختی راننده نامعتبر است: ${rawPayableStr}`);
      } else {
        rawExcelAmount = BigInt(cleanAmt);
        if (rawExcelAmount < 0n) {
          errors.push("مبلغ پرداختی راننده نمی‌تواند منفی باشد.");
        }
      }
    } catch {
      errors.push(`خطا در خواندن مبلغ پرداختی راننده: ${rawPayableStr}`);
    }

    // Parse weight
    let weight = 0;
    try {
      weight = parseFloat(rawWeightStr.replace(/,/g, "")) || 0;
    } catch {
      weight = 0;
    }

    // Check Rule 4: Zero/Zero row (cancelled previously)
    if (rawExcelAmount === 0n && weight === 0 && errors.length === 0) {
      skippedCount++;
      rowResults.push({
        rowNumber: rowNum,
        rawData: rawRow,
        status: "SKIPPED_PREVIOUSLY_CANCELLED",
      });
      continue;
    }

    // Parse date
    let issueDate: Date = new Date();
    try {
      issueDate = parseWaybillDate(rawIssueDate);
    } catch (err: unknown) {
      errors.push(
        err instanceof Error ? err.message : `فرمت تاریخ نامعتبر است: ${rawIssueDate}`
      );
    }

    const waybillYear = rawYearStr ? parseInt(rawYearStr, 10) : null;

    if (errors.length > 0) {
      errorCount++;
      rowResults.push({
        rowNumber: rowNum,
        rawData: rawRow,
        status: "INVALID",
        errors,
      });
    } else {
      validCount++;

      // Pre-calculate payable amount
      const amountChain = calculateWaybillAmount({
        rawExcelAmount,
        roundMultiple,
        surchargeAmount,
        applySurcharge: effectiveApplySurcharge,
      });

      rowResults.push({
        rowNumber: rowNum,
        rawData: rawRow,
        status: "VALID",
        normalizedData: {
          rowNumber: rowNum,
          driverName,
          driverMobile: normalizedMobile!,
          waybillNumber,
          waybillYear,
          rawExcelAmount,
          payableAmount: amountChain.amount,
          weight,
          issueDate,
          origin: rawRow.origin ? String(rawRow.origin).trim() : null,
          destination: rawRow.destination ? String(rawRow.destination).trim() : null,
          grossAmount: rawRow.grossAmount ? BigInt(normalizeDigits(String(rawRow.grossAmount)).replace(/,/g, "")) : null,
          commissionAmount: rawRow.commissionAmount ? BigInt(normalizeDigits(String(rawRow.commissionAmount)).replace(/,/g, "")) : null,
          deductionsAmount: rawRow.deductionsAmount ? BigInt(normalizeDigits(String(rawRow.deductionsAmount)).replace(/,/g, "")) : null,
          netAmount: rawRow.netAmount ? BigInt(normalizeDigits(String(rawRow.netAmount)).replace(/,/g, "")) : null,
          isSkippedPreviouslyCancelled: false,
        },
      });
    }
  }

  // 5. Store import_batch & import_rows in DB
  const batch = await prisma.$transaction(async (tx) => {
    // If re-uploading an uncommitted batch, remove previous rows
    if (existingBatch && existingBatch.status !== "COMMITTED") {
      await tx.importRow.deleteMany({ where: { importBatchId: existingBatch.id } });
      await tx.importBatch.delete({ where: { id: existingBatch.id } });
    }

    const newBatch = await tx.importBatch.create({
      data: {
        organizationId,
        filename,
        fileSize: fileBuffer.length,
        fileHash,
        totalRows: rowResults.length,
        validRows: validCount,
        errorRows: errorCount,
        skippedRows: skippedCount,
        status: "VALIDATED",
        createdBy: createdByUserId,
      },
    });

    // Bulk create rows in chunks of 500
    const chunkSize = 500;
    for (let i = 0; i < rowResults.length; i += chunkSize) {
      const chunk = rowResults.slice(i, i + chunkSize);
      await tx.importRow.createMany({
        data: chunk.map((r) => ({
          importBatchId: newBatch.id,
          rowNumber: r.rowNumber,
          rawDataJson: r.rawData as Prisma.InputJsonObject,
          normalizedDataJson: r.normalizedData
            ? {
                ...r.normalizedData,
                rawExcelAmount: r.normalizedData.rawExcelAmount.toString(),
                payableAmount: r.normalizedData.payableAmount.toString(),
                grossAmount: r.normalizedData.grossAmount?.toString() ?? null,
                commissionAmount: r.normalizedData.commissionAmount?.toString() ?? null,
                deductionsAmount: r.normalizedData.deductionsAmount?.toString() ?? null,
                netAmount: r.normalizedData.netAmount?.toString() ?? null,
                issueDate: r.normalizedData.issueDate.toISOString(),
              }
            : undefined,
          status: r.status,
          errorDetailsJson: r.errors ? (r.errors as Prisma.InputJsonArray) : undefined,
        })),
      });
    }

    return newBatch;
  });

  return {
    batchId: batch.id,
    filename,
    fileHash,
    totalRows: rowResults.length,
    validRows: validCount,
    errorRows: errorCount,
    skippedRows: skippedCount,
    sampleRows: rowResults.slice(0, 10),
  };
}

export interface CommitImportBatchInput {
  organizationId: string;
  batchId: string;
  userId?: string;
}

export interface CommitImportBatchResult {
  batchId: string;
  status: "COMMITTED";
  createdWaybillsCount: number;
  skippedRowsCount: number;
}

/**
 * Step 11: Commits the validated batch atomically, creating Waybills and WaybillAmounts.
 * Enforces business-rules.md §4 & §5.
 */
export async function commitImportBatch(
  input: CommitImportBatchInput
): Promise<CommitImportBatchResult> {
  const { organizationId, batchId, userId } = input;

  return prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.findFirst({
      where: { id: batchId, organizationId },
      include: {
        rows: {
          where: { status: "VALID" },
          orderBy: { rowNumber: "asc" },
        },
      },
    });

    if (!batch) {
      throw new AppError("NOT_FOUND", "بچ ایمپورت مورد نظر یافت نشد.");
    }

    if (batch.status === "COMMITTED") {
      return {
        batchId: batch.id,
        status: "COMMITTED",
        createdWaybillsCount: batch.validRows,
        skippedRowsCount: batch.skippedRows,
      };
    }

    if (batch.status !== "VALIDATED" && batch.status !== "PENDING") {
      throw new AppError(
        "INVALID_BATCH_STATUS",
        `امکان نهایی‌سازی بچ در وضعیت «${batch.status}» وجود ندارد.`
      );
    }

    // Fetch organization settings for calculations
    const settings = await tx.organizationSettings.findUnique({
      where: { organizationId },
    });
    const roundMultiple = settings?.roundMultiple ?? 50_000n;
    const surchargeAmount = settings?.surchargeAmount ?? 700_000n;

    let createdCount = 0;

    for (const row of batch.rows) {
      const norm = row.normalizedDataJson as unknown as SerializedNormalizedData | null;
      if (!norm) continue;

      // 1. Find or create Driver
      let driver = await tx.driver.findFirst({
        where: { organizationId, mobile: norm.driverMobile, status: "ACTIVE" },
      });

      if (!driver) {
        driver = await tx.driver.create({
          data: {
            organizationId,
            mobile: norm.driverMobile,
            fullName: norm.driverName,
            status: "ACTIVE",
          },
        });
      }

      // 2. Calculate amount breakdown from rawExcelAmount
      const rawAmt = BigInt(norm.rawExcelAmount ?? norm.payableAmount);
      const calcResult = calculateWaybillAmount({
        rawExcelAmount: rawAmt,
        roundMultiple,
        surchargeAmount,
        applySurcharge: true,
      });

      // 3. Create Waybill
      const waybill = await tx.waybill.create({
        data: {
          organizationId,
          waybillNumber: norm.waybillNumber,
          waybillYear: norm.waybillYear ?? null,
          driverId: driver.id,
          driverNameRaw: norm.driverName,
          driverMobileRaw: norm.driverMobile,
          issueDate: new Date(norm.issueDate),
          origin: norm.origin,
          destination: norm.destination,
          grossAmount: norm.grossAmount ? BigInt(norm.grossAmount) : null,
          commissionAmount: norm.commissionAmount ? BigInt(norm.commissionAmount) : null,
          deductionsAmount: norm.deductionsAmount ? BigInt(norm.deductionsAmount) : null,
          netAmount: norm.netAmount ? BigInt(norm.netAmount) : null,
          shipmentStatus: "IMPORTED",
          documentStatus: "NOT_UPLOADED",
          paymentStatus: "NOT_SUBMITTED",
          commitmentStatus: "PENDING",
          releaseStatus: "BLOCKED",
          sourceImportId: batch.id,
          createdBy: userId,
        },
      });

      // 4. Create WaybillAmount
      const waybillAmount = await tx.waybillAmount.create({
        data: {
          organizationId,
          waybillId: waybill.id,
          rawExcelAmount: calcResult.rawExcelAmount,
          roundedAmount: calcResult.roundedAmount,
          surchargeAmount: calcResult.surchargeAmount,
          amount: calcResult.amount,
          source: "EXCEL_CALCULATED",
          isCurrent: true,
          status: "APPROVED",
        },
      });

      // 5. Link currentAmountId
      await tx.waybill.update({
        where: { id: waybill.id },
        data: { currentAmountId: waybillAmount.id },
      });

      // 6. Link row to waybill
      await tx.importRow.update({
        where: { id: row.id },
        data: { waybillId: waybill.id, status: "IMPORTED" },
      });

      createdCount++;
    }

    // Update batch to COMMITTED
    await tx.importBatch.update({
      where: { id: batch.id },
      data: { status: "COMMITTED" },
    });

    // Audit log
    await createAuditLogEntry(tx, {
      organizationId,
      actorType: "USER",
      actorId: userId,
      action: "IMPORT_BATCH_COMMITTED",
      entityType: "IMPORT_BATCH",
      entityId: batch.id,
      afterJson: {
        filename: batch.filename,
        createdWaybillsCount: createdCount,
        skippedRowsCount: batch.skippedRows,
      },
    });

    return {
      batchId: batch.id,
      status: "COMMITTED",
      createdWaybillsCount: createdCount,
      skippedRowsCount: batch.skippedRows,
    };
  });
}
