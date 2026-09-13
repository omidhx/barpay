import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  uploadAndMatchPdfs,
  attachDocumentManually,
  replaceWaybillPdf,
} from "@/modules/documents";
import { PDF_MAGIC_BYTES } from "@/modules/documents/pdf-parser";
import { AppError } from "@/lib/errors/exceptions";

function createValidPdfBuffer(content: string = "Mock PDF Content"): Buffer {
  return Buffer.concat([PDF_MAGIC_BYTES, Buffer.from(`1.4\n${content}\n%%EOF`)]);
}

describe("Document Module & 1:1 PDF Matching Engine (PostgreSQL 16) — business-rules.md §6 & master-spec §6.2", () => {
  let testOrgId: string;
  let waybill1Id: string;
  let waybillCancelledId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: "سازمان ترابری آزمایشی تطبیق اسناد",
        slug: `test-pdf-matching-org-${Date.now()}`,
      },
    });
    testOrgId = org.id;

    // Seed Waybill 1 (IMPORTED, NOT_UPLOADED)
    const wb1 = await prisma.waybill.create({
      data: {
        organizationId: testOrgId,
        waybillNumber: "8605186",
        waybillYear: 1403,
        driverNameRaw: "حسین حسینی",
        driverMobileRaw: "09121111111",
        issueDate: new Date(),
        shipmentStatus: "IMPORTED",
        documentStatus: "NOT_UPLOADED",
        paymentStatus: "NOT_SUBMITTED",
        commitmentStatus: "PENDING",
        releaseStatus: "BLOCKED",
      },
    });
    waybill1Id = wb1.id;

    // Seed Waybill Cancelled
    const wbCancelled = await prisma.waybill.create({
      data: {
        organizationId: testOrgId,
        waybillNumber: "990011",
        driverNameRaw: "بهرام بهرامی",
        driverMobileRaw: "09122222222",
        issueDate: new Date(),
        shipmentStatus: "CANCELLED",
        documentStatus: "NOT_UPLOADED",
        paymentStatus: "NOT_SUBMITTED",
        commitmentStatus: "PENDING",
        releaseStatus: "BLOCKED",
      },
    });
    waybillCancelledId = wbCancelled.id;
  });

  afterAll(async () => {
    if (testOrgId) {
      await prisma.organization.delete({
        where: { id: testOrgId },
      });
    }
    await prisma.$disconnect();
  });

  it("auto-matches valid PDF: BL8605186-1403.pdf -> VERIFIED & READY_FOR_DRIVER", async () => {
    const pdfBuffer = createValidPdfBuffer("Waybill 8605186 content");
    const result = await uploadAndMatchPdfs({
      organizationId: testOrgId,
      files: [{ filename: "BL8605186-1403.pdf", buffer: pdfBuffer }],
      uploadedBy: "test-user-operator",
    });

    expect(result.total).toBe(1);
    expect(result.matchedCount).toBe(1);
    expect(result.unmatchedCount).toBe(0);

    const matchRes = result.results[0];
    expect(matchRes.outcome).toBe("MATCHED");
    expect(matchRes.waybillId).toBe(waybill1Id);
    expect(matchRes.documentId).toBeDefined();

    // Verify document in DB
    const doc = await prisma.document.findUnique({
      where: { id: matchRes.documentId! },
    });
    expect(doc).not.toBeNull();
    expect(doc?.matchingStatus).toBe("AUTO_MATCHED");
    expect(doc?.matchingMethod).toBe("FILENAME");
    expect(doc?.extractedWaybillNumber).toBe("8605186");
    expect(doc?.extractedWaybillYear).toBe(1403);
    expect(doc?.documentType).toBe("WAYBILL_PDF");

    // Verify waybill updated
    const updatedWb = await prisma.waybill.findUnique({
      where: { id: waybill1Id },
    });
    expect(updatedWb?.documentStatus).toBe("VERIFIED");
    expect(updatedWb?.shipmentStatus).toBe("READY_FOR_DRIVER");
  });

  it("1:1 policy: uploading a second PDF for the same waybill is flagged ALREADY_ATTACHED", async () => {
    const secondBuffer = createValidPdfBuffer("Second copy of Waybill 8605186");
    const result = await uploadAndMatchPdfs({
      organizationId: testOrgId,
      files: [{ filename: "BL-8605186_new.pdf", buffer: secondBuffer }],
    });

    expect(result.matchedCount).toBe(0);
    expect(result.unmatchedCount).toBe(1);

    const matchRes = result.results[0];
    expect(matchRes.outcome).toBe("ALREADY_ATTACHED");
    expect(matchRes.waybillId).toBe(waybill1Id);

    // Verify document in DB is saved as UNMATCHED without attaching to waybill
    const doc = await prisma.document.findUnique({
      where: { id: matchRes.documentId! },
    });
    expect(doc?.matchingStatus).toBe("UNMATCHED");
    expect(doc?.waybillId).toBeNull();
  });

  it("physical DB constraint: idx_documents_active_waybill_pdf prevents two active PDFs per waybill", async () => {
    const thirdBuffer = createValidPdfBuffer("Force attach attempt");

    // Attempting raw DB insert of a second WAYBILL_PDF with matching_status != 'REPLACED' on waybill1
    await expect(
      prisma.document.create({
        data: {
          organizationId: testOrgId,
          waybillId: waybill1Id,
          documentType: "WAYBILL_PDF",
          storageKey: "test/key/force.pdf",
          fileSize: thirdBuffer.length,
          mimeType: "application/pdf",
          sha256Hash: "fakehash123",
          matchingStatus: "AUTO_MATCHED",
        },
      })
    ).rejects.toThrow();
  });

  it("protects dead waybills: PDF matching a CANCELLED waybill is flagged MANUAL_REVIEW", async () => {
    const pdfBuffer = createValidPdfBuffer("Cancelled waybill content");
    const result = await uploadAndMatchPdfs({
      organizationId: testOrgId,
      files: [{ filename: "BL990011.pdf", buffer: pdfBuffer }],
    });

    expect(result.matchedCount).toBe(0);
    expect(result.unmatchedCount).toBe(1);

    const matchRes = result.results[0];
    expect(matchRes.outcome).toBe("MANUAL_REVIEW");
    expect(matchRes.waybillId).toBe(waybillCancelledId);

    // Verify document is not attached quietly
    const doc = await prisma.document.findUnique({
      where: { id: matchRes.documentId! },
    });
    expect(doc?.matchingStatus).toBe("UNMATCHED");
    expect(doc?.waybillId).toBeNull();
  });

  it("duplicate candidates: flags DUPLICATE_MATCH when multiple waybills share the same number across years", async () => {
    // Seed two waybills with same number in year 1401 and 1402
    await prisma.waybill.create({
      data: {
        organizationId: testOrgId,
        waybillNumber: "778899",
        waybillYear: 1401,
        driverNameRaw: "راننده ۱",
        driverMobileRaw: "09123333333",
        issueDate: new Date(),
      },
    });
    await prisma.waybill.create({
      data: {
        organizationId: testOrgId,
        waybillNumber: "778899",
        waybillYear: 1402,
        driverNameRaw: "راننده ۲",
        driverMobileRaw: "09124444444",
        issueDate: new Date(),
      },
    });

    const pdfBuffer = createValidPdfBuffer("Ambiguous content");
    const result = await uploadAndMatchPdfs({
      organizationId: testOrgId,
      files: [{ filename: "BL_778899.pdf", buffer: pdfBuffer }],
    });

    expect(result.matchedCount).toBe(0);
    expect(result.unmatchedCount).toBe(1);
    expect(result.results[0].outcome).toBe("DUPLICATE_MATCH");
  });

  it("manual attachment workflow: attaches an UNMATCHED document to a waybill", async () => {
    // 1. Create a waybill
    const wbManual = await prisma.waybill.create({
      data: {
        organizationId: testOrgId,
        waybillNumber: "MANUAL-777",
        driverNameRaw: "سعید سعیدی",
        driverMobileRaw: "09125555555",
        issueDate: new Date(),
        shipmentStatus: "IMPORTED",
        documentStatus: "NOT_UPLOADED",
      },
    });

    // 2. Upload file with non-standard name
    const pdfBuffer = createValidPdfBuffer("Manual scan content");
    const uploadRes = await uploadAndMatchPdfs({
      organizationId: testOrgId,
      files: [{ filename: "scanned_doc_today.pdf", buffer: pdfBuffer }],
    });

    expect(uploadRes.results[0].outcome).toBe("INVALID_FILENAME");
    const documentId = uploadRes.results[0].documentId!;

    // 3. Attach manually
    const attachRes = await attachDocumentManually({
      organizationId: testOrgId,
      documentId,
      waybillId: wbManual.id,
      userId: "operator-ali",
    });

    expect(attachRes.success).toBe(true);

    // Verify DB
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    expect(doc?.matchingStatus).toBe("MANUALLY_ATTACHED");
    expect(doc?.matchingMethod).toBe("MANUAL");
    expect(doc?.waybillId).toBe(wbManual.id);

    const wb = await prisma.waybill.findUnique({ where: { id: wbManual.id } });
    expect(wb?.documentStatus).toBe("VERIFIED");
    expect(wb?.shipmentStatus).toBe("READY_FOR_DRIVER");
  });

  it("replaceWaybillPdf workflow: marks old PDF as REPLACED and attaches new active PDF with mandatory reason", async () => {
    // waybill1 already has an active PDF from test 1
    const newPdfBuffer = createValidPdfBuffer("High-resolution re-scan");

    // Must fail without reason
    await expect(
      replaceWaybillPdf({
        organizationId: testOrgId,
        waybillId: waybill1Id,
        fileBuffer: newPdfBuffer,
        filename: "BL8605186_hires.pdf",
        reason: "",
      })
    ).rejects.toThrowError(AppError);

    // Successful replacement
    const replaceRes = await replaceWaybillPdf({
      organizationId: testOrgId,
      waybillId: waybill1Id,
      fileBuffer: newPdfBuffer,
      filename: "BL8605186_hires.pdf",
      reason: "اسکن باکیفیت‌تر و خواناتر به درخواست متصدی بارگیری شد",
      userId: "operator-supervisor",
    });

    expect(replaceRes.success).toBe(true);
    expect(replaceRes.previousDocumentId).toBeDefined();
    expect(replaceRes.newDocumentId).toBeDefined();

    // Verify previous document is marked REPLACED
    const prevDoc = await prisma.document.findUnique({
      where: { id: replaceRes.previousDocumentId! },
    });
    expect(prevDoc?.matchingStatus).toBe("REPLACED");

    // Verify new document is active
    const newDoc = await prisma.document.findUnique({
      where: { id: replaceRes.newDocumentId },
    });
    expect(newDoc?.matchingStatus).toBe("MANUALLY_ATTACHED");
    expect(newDoc?.waybillId).toBe(waybill1Id);

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: testOrgId,
        action: "DOCUMENT_REPLACED",
        entityId: waybill1Id,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.afterJson).toMatchObject({
      newDocumentId: replaceRes.newDocumentId,
      reason: "اسکن باکیفیت‌تر و خواناتر به درخواست متصدی بارگیری شد",
    });
  });
});
