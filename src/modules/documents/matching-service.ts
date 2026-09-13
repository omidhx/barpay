import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import { getStorageProvider } from "@/lib/storage";
import { AppError } from "@/lib/errors/exceptions";
import { createAuditLogEntry } from "@/lib/audit/audit-logger";
import { parseAndValidatePdf } from "./pdf-parser";

export interface UploadDocumentInput {
  filename: string;
  buffer: Buffer;
}

export interface BatchUploadAndMatchInput {
  organizationId: string;
  files: UploadDocumentInput[];
  uploadedBy?: string;
  preferredImportBatchId?: string;
}

export type DocumentMatchOutcome =
  | "MATCHED"
  | "NOT_FOUND"
  | "DUPLICATE_MATCH"
  | "INVALID_FILENAME"
  | "ALREADY_ATTACHED"
  | "MANUAL_REVIEW"
  | "CORRUPTED";

export interface DocumentProcessingResult {
  filename: string;
  documentId?: string;
  waybillId?: string | null;
  waybillNumber?: string | null;
  outcome: DocumentMatchOutcome;
  message: string;
}

export interface BatchUploadAndMatchResult {
  total: number;
  matchedCount: number;
  unmatchedCount: number;
  results: DocumentProcessingResult[];
}

/**
 * Uploads a batch of PDFs, validates magic bytes/JS, extracts waybill number,
 * and auto-matches 1:1 without human intervention (business-rules.md §6 & master-spec §6.2).
 */
export async function uploadAndMatchPdfs(
  input: BatchUploadAndMatchInput
): Promise<BatchUploadAndMatchResult> {
  const { organizationId, files, uploadedBy, preferredImportBatchId } = input;
  const storage = getStorageProvider();

  const results: DocumentProcessingResult[] = [];
  let matchedCount = 0;
  let unmatchedCount = 0;

  for (const file of files) {
    const documentId = randomUUID();
    const storageKey = `organizations/${organizationId}/documents/${documentId}.pdf`;

    // 1. Validate PDF format and security
    let metadata;
    try {
      metadata = parseAndValidatePdf(file.buffer, file.filename);
    } catch (err: unknown) {
      unmatchedCount++;
      const appErr = err as AppError;
      results.push({
        filename: file.filename,
        outcome: "CORRUPTED",
        message: appErr.message || "فایل نامعتبر است یا با امضای PDF تطابق ندارد.",
      });
      continue;
    }

    // 2. Persist to private storage
    await storage.put(storageKey, file.buffer, metadata.mimeType);

    // 3. Handle filename without valid waybill number
    if (!metadata.waybillNumber) {
      const doc = await prisma.document.create({
        data: {
          id: documentId,
          organizationId,
          documentType: "WAYBILL_PDF",
          storageKey,
          fileSize: metadata.fileSize,
          mimeType: metadata.mimeType,
          sha256Hash: metadata.sha256Hash,
          matchingMethod: "FILENAME",
          matchingStatus: "UNMATCHED",
          uploadedBy,
        },
      });

      unmatchedCount++;
      results.push({
        filename: file.filename,
        documentId: doc.id,
        outcome: "INVALID_FILENAME",
        message: "شماره بارنامه از نام فایل استخراج نشد (الگوی BL...). فایل در وضعیت بدون تطبیق ذخیره گردید.",
      });
      continue;
    }

    const { waybillNumber, waybillYear } = metadata;

    // 4. Query candidate waybills in organization
    const allCandidates = await prisma.waybill.findMany({
      where: {
        organizationId,
        waybillNumber,
      },
      include: {
        documents: {
          where: {
            documentType: "WAYBILL_PDF",
            matchingStatus: { not: "REPLACED" },
          },
        },
      },
    });

    if (allCandidates.length === 0) {
      // Not found
      const doc = await prisma.document.create({
        data: {
          id: documentId,
          organizationId,
          documentType: "WAYBILL_PDF",
          storageKey,
          fileSize: metadata.fileSize,
          mimeType: metadata.mimeType,
          sha256Hash: metadata.sha256Hash,
          extractedWaybillNumber: waybillNumber,
          extractedWaybillYear: waybillYear,
          matchingMethod: "FILENAME",
          matchingStatus: "UNMATCHED",
          uploadedBy,
        },
      });

      unmatchedCount++;
      results.push({
        filename: file.filename,
        documentId: doc.id,
        waybillNumber,
        outcome: "NOT_FOUND",
        message: `بارنامه‌ای با شماره «${waybillNumber}» در سازمان یافت نشد.`,
      });
      continue;
    }

    // Prioritize candidates:
    // A. By preferred import batch if provided
    let narrowed = allCandidates;
    if (preferredImportBatchId) {
      const inBatch = allCandidates.filter((c) => c.sourceImportId === preferredImportBatchId);
      if (inBatch.length > 0) {
        narrowed = inBatch;
      }
    }

    // B. By year if extracted
    if (waybillYear && narrowed.length > 1) {
      const inYear = narrowed.filter((c) => c.waybillYear === waybillYear);
      if (inYear.length > 0) {
        narrowed = inYear;
      }
    }

    // Check for ambiguity (multiple active candidates)
    if (narrowed.length > 1) {
      const doc = await prisma.document.create({
        data: {
          id: documentId,
          organizationId,
          documentType: "WAYBILL_PDF",
          storageKey,
          fileSize: metadata.fileSize,
          mimeType: metadata.mimeType,
          sha256Hash: metadata.sha256Hash,
          extractedWaybillNumber: waybillNumber,
          extractedWaybillYear: waybillYear,
          matchingMethod: "FILENAME",
          matchingStatus: "UNMATCHED",
          uploadedBy,
        },
      });

      unmatchedCount++;
      results.push({
        filename: file.filename,
        documentId: doc.id,
        waybillNumber,
        outcome: "DUPLICATE_MATCH",
        message: `بیش از یک بارنامه با شماره «${waybillNumber}» یافت شد (تطبیق مبهم). اتصال خودکار متوقف شد.`,
      });
      continue;
    }

    const candidate = narrowed[0];

    // Check if candidate is CANCELLED or ARCHIVED (master-doc v2.2)
    if (candidate.shipmentStatus === "CANCELLED" || candidate.shipmentStatus === "ARCHIVED") {
      const doc = await prisma.document.create({
        data: {
          id: documentId,
          organizationId,
          documentType: "WAYBILL_PDF",
          storageKey,
          fileSize: metadata.fileSize,
          mimeType: metadata.mimeType,
          sha256Hash: metadata.sha256Hash,
          extractedWaybillNumber: waybillNumber,
          extractedWaybillYear: waybillYear,
          matchingMethod: "FILENAME",
          matchingStatus: "UNMATCHED",
          uploadedBy,
        },
      });

      unmatchedCount++;
      results.push({
        filename: file.filename,
        documentId: doc.id,
        waybillNumber,
        waybillId: candidate.id,
        outcome: "MANUAL_REVIEW",
        message: `بارنامه «${waybillNumber}» باطل یا بایگانی شده است. اتصال خودکار به پرونده غیرفعال مسدود گردید.`,
      });
      continue;
    }

    // Check 1:1 policy (candidate already has an active WAYBILL_PDF)
    if (candidate.documents.length > 0) {
      const doc = await prisma.document.create({
        data: {
          id: documentId,
          organizationId,
          documentType: "WAYBILL_PDF",
          storageKey,
          fileSize: metadata.fileSize,
          mimeType: metadata.mimeType,
          sha256Hash: metadata.sha256Hash,
          extractedWaybillNumber: waybillNumber,
          extractedWaybillYear: waybillYear,
          matchingMethod: "FILENAME",
          matchingStatus: "UNMATCHED",
          uploadedBy,
        },
      });

      unmatchedCount++;
      results.push({
        filename: file.filename,
        documentId: doc.id,
        waybillNumber,
        waybillId: candidate.id,
        outcome: "ALREADY_ATTACHED",
        message: `بارنامه «${waybillNumber}» از قبل دارای فایل PDF فعال است. برای جایگزینی از فرآیند جایگزینی PDF استفاده فرمایید.`,
      });
      continue;
    }

    // 5. All criteria met: Auto-attach 1:1 and transition status in transaction
    await prisma.$transaction(async (tx) => {
      // Create Document attached to waybill
      await tx.document.create({
        data: {
          id: documentId,
          organizationId,
          waybillId: candidate.id,
          documentType: "WAYBILL_PDF",
          storageKey,
          fileSize: metadata.fileSize,
          mimeType: metadata.mimeType,
          sha256Hash: metadata.sha256Hash,
          extractedWaybillNumber: waybillNumber,
          extractedWaybillYear: waybillYear,
          matchingMethod: "FILENAME",
          matchingStatus: "AUTO_MATCHED",
          uploadedBy,
        },
      });

      // Update Waybill documentStatus to VERIFIED and advance shipmentStatus if IMPORTED
      const updateData: {
        documentStatus: "VERIFIED";
        shipmentStatus?: "READY_FOR_DRIVER";
        version: { increment: number };
      } = {
        documentStatus: "VERIFIED",
        version: { increment: 1 },
      };

      if (candidate.shipmentStatus === "IMPORTED") {
        updateData.shipmentStatus = "READY_FOR_DRIVER";
      }

      await tx.waybill.update({
        where: { id: candidate.id },
        data: updateData,
      });

      // Audit log
      await createAuditLogEntry(tx, {
        organizationId,
        actorType: uploadedBy ? "USER" : "SYSTEM",
        actorId: uploadedBy,
        action: "DOCUMENT_AUTO_MATCHED",
        entityType: "WAYBILL",
        entityId: candidate.id,
        afterJson: {
          documentId,
          waybillNumber,
          storageKey,
          sha256Hash: metadata.sha256Hash,
        },
      });
    });

    matchedCount++;
    results.push({
      filename: file.filename,
      documentId,
      waybillNumber,
      waybillId: candidate.id,
      outcome: "MATCHED",
      message: `فایل با بارنامه «${waybillNumber}» تطبیق خودکار داده شد و متصل گردید.`,
    });
  }

  return {
    total: files.length,
    matchedCount,
    unmatchedCount,
    results,
  };
}

export interface AttachDocumentManuallyInput {
  organizationId: string;
  documentId: string;
  waybillId: string;
  userId?: string;
}

/**
 * Manually attaches an unmatched document to a selected waybill.
 * Respects 1:1 policy (fails if waybill already has an active PDF).
 */
export async function attachDocumentManually(
  input: AttachDocumentManuallyInput
) {
  const { organizationId, documentId, waybillId, userId } = input;

  return prisma.$transaction(async (tx) => {
    const doc = await tx.document.findFirst({
      where: { id: documentId, organizationId },
    });

    if (!doc) {
      throw new AppError("NOT_FOUND", "سند مورد نظر یافت نشد.");
    }

    if (doc.waybillId && doc.matchingStatus !== "REPLACED") {
      throw new AppError(
        "DOCUMENT_ALREADY_ATTACHED",
        "این سند در حال حاضر به بارنامه دیگری متصل است."
      );
    }

    const waybill = await tx.waybill.findFirst({
      where: { id: waybillId, organizationId },
      include: {
        documents: {
          where: {
            documentType: "WAYBILL_PDF",
            matchingStatus: { not: "REPLACED" },
          },
        },
      },
    });

    if (!waybill) {
      throw new AppError("NOT_FOUND", "بارنامه مورد نظر یافت نشد.");
    }

    if (waybill.shipmentStatus === "CANCELLED" || waybill.shipmentStatus === "ARCHIVED") {
      throw new AppError(
        "WAYBILL_NOT_ACTIVE",
        "امکان اتصال سند به بارنامه باطل‌شده یا بایگانی‌شده وجود ندارد."
      );
    }

    // 1:1 check: ensure waybill does not already have an active WAYBILL_PDF
    if (waybill.documents.length > 0) {
      throw new AppError(
        "ALREADY_ATTACHED",
        "این بارنامه دارای فایل PDF فعال است. برای تغییر فایل، از امکان «جایگزینی PDF» با ثبت دلیل استفاده فرمایید."
      );
    }

    // Update document
    await tx.document.update({
      where: { id: doc.id },
      data: {
        waybillId: waybill.id,
        matchingMethod: "MANUAL",
        matchingStatus: "MANUALLY_ATTACHED",
      },
    });

    // Update waybill
    const updateData: {
      documentStatus: "VERIFIED";
      shipmentStatus?: "READY_FOR_DRIVER";
      version: { increment: number };
    } = {
      documentStatus: "VERIFIED",
      version: { increment: 1 },
    };

    if (waybill.shipmentStatus === "IMPORTED") {
      updateData.shipmentStatus = "READY_FOR_DRIVER";
    }

    await tx.waybill.update({
      where: { id: waybill.id },
      data: updateData,
    });

    // Audit log
    await createAuditLogEntry(tx, {
      organizationId,
      actorType: "USER",
      actorId: userId,
      action: "DOCUMENT_MANUALLY_ATTACHED",
      entityType: "WAYBILL",
      entityId: waybill.id,
      afterJson: {
        documentId: doc.id,
        waybillNumber: waybill.waybillNumber,
      },
    });

    return {
      success: true,
      documentId: doc.id,
      waybillId: waybill.id,
    };
  });
}

export interface ReplaceWaybillPdfInput {
  organizationId: string;
  waybillId: string;
  fileBuffer: Buffer;
  filename: string;
  reason: string;
  userId?: string;
}

/**
 * Replaces the active PDF for a waybill with an operator-supplied reason (REPLACE_PDF workflow).
 * Marks the old active PDF as REPLACED, allowing the partial unique index slot to be freed.
 */
export async function replaceWaybillPdf(input: ReplaceWaybillPdfInput) {
  const { organizationId, waybillId, fileBuffer, filename, reason, userId } = input;

  if (!reason || !reason.trim()) {
    throw new AppError("REASON_REQUIRED", "ثبت دلیل الزامی برای جایگزینی فایل PDF الزامی است.");
  }

  // 1. Validate new PDF
  const metadata = parseAndValidatePdf(fileBuffer, filename);
  const newDocumentId = randomUUID();
  const storageKey = `organizations/${organizationId}/documents/${newDocumentId}.pdf`;

  const storage = getStorageProvider();
  await storage.put(storageKey, fileBuffer, metadata.mimeType);

  return prisma.$transaction(async (tx) => {
    const waybill = await tx.waybill.findFirst({
      where: { id: waybillId, organizationId },
      include: {
        documents: {
          where: {
            documentType: "WAYBILL_PDF",
            matchingStatus: { not: "REPLACED" },
          },
        },
      },
    });

    if (!waybill) {
      throw new AppError("NOT_FOUND", "بارنامه مورد نظر یافت نشد.");
    }

    if (waybill.shipmentStatus === "CANCELLED" || waybill.shipmentStatus === "ARCHIVED") {
      throw new AppError(
        "WAYBILL_NOT_ACTIVE",
        "امکان جایگزینی سند برای بارنامه باطل‌شده یا بایگانی‌شده وجود ندارد."
      );
    }

    // 2. Mark existing active PDF(s) as REPLACED
    const existingDoc = waybill.documents[0];
    if (existingDoc) {
      await tx.document.update({
        where: { id: existingDoc.id },
        data: { matchingStatus: "REPLACED" },
      });
    }

    // 3. Create new Document linked to waybill
    const newDoc = await tx.document.create({
      data: {
        id: newDocumentId,
        organizationId,
        waybillId: waybill.id,
        documentType: "WAYBILL_PDF",
        storageKey,
        fileSize: metadata.fileSize,
        mimeType: metadata.mimeType,
        sha256Hash: metadata.sha256Hash,
        extractedWaybillNumber: metadata.waybillNumber,
        extractedWaybillYear: metadata.waybillYear,
        matchingMethod: "MANUAL",
        matchingStatus: "MANUALLY_ATTACHED",
        uploadedBy: userId,
      },
    });

    // 4. Update waybill document status to VERIFIED (if needed)
    await tx.waybill.update({
      where: { id: waybill.id },
      data: {
        documentStatus: "VERIFIED",
        version: { increment: 1 },
      },
    });

    // 5. Audit log
    await createAuditLogEntry(tx, {
      organizationId,
      actorType: "USER",
      actorId: userId,
      action: "DOCUMENT_REPLACED",
      entityType: "WAYBILL",
      entityId: waybill.id,
      beforeJson: {
        previousDocumentId: existingDoc?.id ?? null,
      },
      afterJson: {
        newDocumentId: newDoc.id,
        reason,
        storageKey,
      },
    });

    return {
      success: true,
      previousDocumentId: existingDoc?.id ?? null,
      newDocumentId: newDoc.id,
      waybillId: waybill.id,
    };
  });
}
