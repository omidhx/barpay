import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db/client";
import {
  processImportFile,
  commitImportBatch,
} from "@/modules/imports";
import { AppError } from "@/lib/errors/exceptions";

function createTestExcelBuffer(
  rows: Array<Array<unknown>>,
  options?: { sheetName?: string; merges?: XLSX.Range[] }
): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (options?.merges) {
    ws["!merges"] = options.merges;
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, options?.sheetName || "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("Excel Import Engine (PostgreSQL 16) — business-rules.md §4 & §5", () => {
  let testOrgId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: "سازمان ترابری آزمایشی ایمپورت اکسل",
        slug: `test-import-org-${Date.now()}`,
      },
    });
    testOrgId = org.id;

    // Create organization settings
    await prisma.organizationSettings.create({
      data: {
        organizationId: testOrgId,
        roundMultiple: 50_000n,
        surchargeAmount: 700_000n,
        applySurchargeDefault: true,
      },
    });
  });

  afterAll(async () => {
    if (testOrgId) {
      await prisma.organization.delete({
        where: { id: testOrgId },
      });
    }
    await prisma.$disconnect();
  });

  it("11-step pipeline: parses valid rows, skips zero/zero rows, flags invalid rows, and commits golden amounts", async () => {
    const sheetData = [
      ["نام راننده", "شماره موبایل", "شماره بارنامه", "جمع پرداختی راننده", "وزن", "تاریخ صدور", "سال"],
      // Row 1: Golden test 1 (80,686,445 -> 80,700,000 + 700,000 = 81,400,000)
      ["علی محمدی", "۰۹۱۲۳۴۵۶۷۸۹", "WB-1001", "80,686,445", "15000", "1403/10/15", "1403"],
      // Row 2: Golden test 2 (13,712,500 -> 13,750,000 + 700,000 = 14,450,000)
      ["رضا اکبری", "09351234567", "WB-1002", "13712500", "12000", "1403/11/01", "1403"],
      // Row 3: Rule 4 — Zero/Zero row (cancelled previously) -> SKIPPED
      ["حسین رضایی", "09129876543", "WB-1003", "0", "0", "1403/10/20", "1403"],
      // Row 4: Invalid row (bad mobile) -> INVALID
      ["مهدی کریمی", "0912", "WB-1004", "50000000", "8000", "1403/10/20", "1403"],
    ];

    const fileBuffer = createTestExcelBuffer(sheetData);
    const filename = "waybills_test_batch.xlsx";

    // 1. Process preview
    const preview = await processImportFile({
      organizationId: testOrgId,
      filename,
      fileBuffer,
    });

    expect(preview.totalRows).toBe(4);
    expect(preview.validRows).toBe(2);
    expect(preview.skippedRows).toBe(1);
    expect(preview.errorRows).toBe(1);

    // Check row statuses
    const skippedRow = preview.sampleRows.find(
      (r) => r.status === "SKIPPED_PREVIOUSLY_CANCELLED"
    );
    expect(skippedRow).toBeDefined();
    expect(skippedRow?.rowNumber).toBe(4); // row 4 in spreadsheet (1-based including header)

    const invalidRow = preview.sampleRows.find((r) => r.status === "INVALID");
    expect(invalidRow).toBeDefined();
    expect(invalidRow?.errors?.[0]).toContain("شماره موبایل نامعتبر است");

    // 2. Commit batch
    const commitResult = await commitImportBatch({
      organizationId: testOrgId,
      batchId: preview.batchId,
    });

    expect(commitResult.status).toBe("COMMITTED");
    expect(commitResult.createdWaybillsCount).toBe(2);
    expect(commitResult.skippedRowsCount).toBe(1);

    // 3. Verify Waybill & WaybillAmount in DB
    const wb1 = await prisma.waybill.findFirst({
      where: { organizationId: testOrgId, waybillNumber: "WB-1001" },
      include: { amounts: { where: { isCurrent: true } }, driver: true },
    });

    expect(wb1).not.toBeNull();
    expect(wb1?.driverMobileRaw).toBe("09123456789");
    expect(wb1?.driver?.fullName).toBe("علی محمدی");
    const amount1 = wb1?.amounts[0];
    expect(amount1?.rawExcelAmount).toBe(80686445n);
    expect(amount1?.roundedAmount).toBe(80700000n);
    expect(amount1?.surchargeAmount).toBe(700000n);
    expect(amount1?.amount).toBe(81400000n);
    expect(wb1?.shipmentStatus).toBe("IMPORTED");
    expect(wb1?.commitmentStatus).toBe("PENDING");
    expect(wb1?.paymentStatus).toBe("NOT_SUBMITTED");
    expect(wb1?.releaseStatus).toBe("BLOCKED");

    const wb2 = await prisma.waybill.findFirst({
      where: { organizationId: testOrgId, waybillNumber: "WB-1002" },
      include: { amounts: { where: { isCurrent: true } } },
    });
    expect(wb2).not.toBeNull();
    const amount2 = wb2?.amounts[0];
    expect(amount2?.rawExcelAmount).toBe(13712500n);
    expect(amount2?.roundedAmount).toBe(13750000n);
    expect(amount2?.surchargeAmount).toBe(700000n);
    expect(amount2?.amount).toBe(14450000n);

    // 4. Verify that the zero/zero row was NEVER created as a waybill (Rule 4)
    const wb3 = await prisma.waybill.findFirst({
      where: { organizationId: testOrgId, waybillNumber: "WB-1003" },
    });
    expect(wb3).toBeNull();

    // 5. Verify audit log entry
    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: testOrgId,
        action: "IMPORT_BATCH_COMMITTED",
        entityId: preview.batchId,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.prevHash).toBeDefined();
    expect(audit?.rowHash).toBeDefined();

    // 6. Test Idempotency: re-uploading the exact same file buffer throws IMPORT_ALREADY_PROCESSED
    await expect(
      processImportFile({
        organizationId: testOrgId,
        filename,
        fileBuffer,
      })
    ).rejects.toThrowError(AppError);

    try {
      await processImportFile({
        organizationId: testOrgId,
        filename,
        fileBuffer,
      });
    } catch (err: unknown) {
      const appErr = err as AppError;
      expect(appErr.code).toBe("IMPORT_ALREADY_PROCESSED");
    }
  });

  it("rejects file if mandatory column is missing with specific column names", async () => {
    // Missing "نام راننده" (only mobile, waybill number, amount)
    const sheetData = [
      ["شماره موبایل", "شماره بارنامه", "جمع پرداختی راننده"],
      ["09121234567", "WB-999", "10000000"],
    ];

    const fileBuffer = createTestExcelBuffer(sheetData);

    try {
      await processImportFile({
        organizationId: testOrgId,
        filename: "missing_columns.xlsx",
        fileBuffer,
      });
      expect.fail("Should have thrown missing mandatory columns error");
    } catch (err: unknown) {
      if (!(err instanceof AppError)) throw err;
      expect(err.code).toBe("MISSING_MANDATORY_COLUMNS");
      expect(err.message).toContain("نام راننده");
    }
  });

  it("rejects file with merged cells", async () => {
    const sheetData = [
      ["نام راننده", "شماره موبایل", "شماره بارنامه", "جمع پرداختی راننده"],
      ["علی محمدی", "09121234567", "WB-999", "10000000"],
    ];

    const fileBuffer = createTestExcelBuffer(sheetData, {
      merges: [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }],
    });

    try {
      await processImportFile({
        organizationId: testOrgId,
        filename: "merged_cells.xlsx",
        fileBuffer,
      });
      expect.fail("Should have thrown merged cells error");
    } catch (err: unknown) {
      if (!(err instanceof AppError)) throw err;
      expect(err.code).toBe("MERGED_CELLS_NOT_ALLOWED");
      expect(err.message).toContain("سلول‌های ادغام‌شده");
    }
  });

  it("rejects macro-enabled files (.xlsm)", async () => {
    const sheetData = [
      ["نام راننده", "شماره موبایل", "شماره بارنامه", "جمع پرداختی راننده"],
      ["علی محمدی", "09121234567", "WB-999", "10000000"],
    ];

    const fileBuffer = createTestExcelBuffer(sheetData);

    try {
      await processImportFile({
        organizationId: testOrgId,
        filename: "suspicious_macro.xlsm",
        fileBuffer,
      });
      expect.fail("Should have rejected .xlsm file");
    } catch (err: unknown) {
      if (!(err instanceof AppError)) throw err;
      expect(err.code).toBe("INVALID_FILE_FORMAT");
      expect(err.message).toContain("ماکرودار");
    }
  });
});
