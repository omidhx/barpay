import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  transitionPaymentStatus,
  submitWaybillPayment,
  acceptDriverCommitment,
  transitionWaybillShipmentStatus,
} from "@/modules/waybills/state-machine";
import {
  canReleaseAndGrantDownload,
  evaluateReleaseConditions,
} from "@/modules/delivery/release-service";
import {
  PaymentStateConflictError,
  CommitmentNotAcceptedError,
  WaybillNotActiveError,
} from "@/lib/errors/exceptions";

describe("State Machine & Concurrency (PostgreSQL 16) — state-transitions.md & AGENTS.md", () => {
  let testOrgId: string;
  let testCommitmentVersionId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: "سازمان ترابری آزمایشی هم‌زمانی",
        slug: `test-concurrency-org-${Date.now()}`,
      },
    });
    testOrgId = org.id;

    // Create an active commitment version
    const version = await prisma.commitmentVersion.create({
      data: {
        organizationId: testOrgId,
        title: "تعهدنامه راننده آزمایشی",
        templateKey: "DRIVER_BASIC",
        variablesJson: { driver_name: "نام راننده" },
        body: "اینجانب تعهد می‌نمایم...",
        contentHash: "hash-active-v1",
        status: "ACTIVE",
        isDefault: true,
      },
    });
    testCommitmentVersionId = version.id;
  });

  afterAll(async () => {
    if (testOrgId) {
      await prisma.organization.delete({
        where: { id: testOrgId },
      });
    }
    await prisma.$disconnect();
  });

  it("MANDATORY RACE TEST: two concurrent reviewers on one payment — first wins, second gets 409 PAYMENT_STATE_CONFLICT", async () => {
    // 1. Setup Waybill and Amount
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: testOrgId,
        waybillNumber: `WB-RACE-${Date.now()}`,
        driverNameRaw: "احمد راننده",
        driverMobileRaw: "09123334455",
        issueDate: new Date(),
        commitmentStatus: "ACCEPTED",
        paymentStatus: "SUBMITTED",
      },
    });

    const amount = await prisma.waybillAmount.create({
      data: {
        organizationId: testOrgId,
        waybillId: waybill.id,
        rawExcelAmount: 20_000_000n,
        roundedAmount: 20_000_000n,
        surchargeAmount: 700_000n,
        amount: 20_700_000n,
        isCurrent: true,
      },
    });

    // 2. Setup Payment in SUBMITTED status (version = 1)
    const payment = await prisma.payment.create({
      data: {
        organizationId: testOrgId,
        waybillId: waybill.id,
        waybillAmountId: amount.id,
        method: "CARD_TO_CARD",
        amount: 20_700_000n,
        status: "SUBMITTED",
        version: 1,
      },
    });

    // 3. Simulate two reviewers simultaneously attempting to review the same payment
    // Reviewer A wants to APPROVE; Reviewer B wants to REJECT with a reason
    const promiseA = transitionPaymentStatus({
      organizationId: testOrgId,
      paymentId: payment.id,
      targetStatus: "APPROVED",
      expectedVersion: 1,
      actor: { actorType: "USER", actorId: "reviewer-A" },
      notes: "تأیید فیش توسط متصدی اول",
    });

    const promiseB = transitionPaymentStatus({
      organizationId: testOrgId,
      paymentId: payment.id,
      targetStatus: "REJECTED",
      expectedVersion: 1,
      actor: { actorType: "USER", actorId: "reviewer-B" },
      rejectionReason: "مغایرت شماره پیگیری توسط متصدی دوم",
    });

    const results = await Promise.allSettled([promiseA, promiseB]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one must win and exactly one must fail with conflict
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const winner = (fulfilled[0] as PromiseFulfilledResult<any>).value;
    expect(winner.success).toBe(true);
    expect(winner.newVersion).toBe(2);

    const loserError = (rejected[0] as PromiseRejectedResult).reason;
    expect(loserError).toBeInstanceOf(PaymentStateConflictError);
    expect(loserError.code).toBe("PAYMENT_STATE_CONFLICT");
    expect(loserError.httpStatus).toBe(409);

    // Verify database state: version must be 2, not 3
    const finalPayment = await prisma.payment.findUnique({
      where: { id: payment.id },
    });
    expect(finalPayment?.version).toBe(2);
    expect(["APPROVED", "REJECTED"]).toContain(finalPayment?.status);
  });

  it("Idempotency: repeating the same transition on current status returns success without secondary effect", async () => {
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: testOrgId,
        waybillNumber: `WB-IDEMP-${Date.now()}`,
        driverNameRaw: "کاظم راننده",
        driverMobileRaw: "09124445566",
        issueDate: new Date(),
        paymentStatus: "APPROVED",
      },
    });

    const amount = await prisma.waybillAmount.create({
      data: {
        organizationId: testOrgId,
        waybillId: waybill.id,
        rawExcelAmount: 15_000_000n,
        roundedAmount: 15_000_000n,
        surchargeAmount: 0n,
        amount: 15_000_000n,
        isCurrent: true,
      },
    });

    const payment = await prisma.payment.create({
      data: {
        organizationId: testOrgId,
        waybillId: waybill.id,
        waybillAmountId: amount.id,
        method: "POS",
        amount: 15_000_000n,
        status: "APPROVED",
        version: 2,
      },
    });

    const result = await transitionPaymentStatus({
      organizationId: testOrgId,
      paymentId: payment.id,
      targetStatus: "APPROVED",
      expectedVersion: 2,
      actor: { actorType: "USER", actorId: "admin" },
    });

    expect(result.success).toBe(true);
    expect(result.idempotent).toBe(true);
  });

  it("Decision 19 / Invariant I-14: Commitment before Payment in ENFORCED mode", async () => {
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: testOrgId,
        waybillNumber: `WB-COMMIT-${Date.now()}`,
        driverNameRaw: "مجتبی راننده",
        driverMobileRaw: "09125556677",
        issueDate: new Date(),
        commitmentStatus: "PENDING",
      },
    });

    await prisma.waybillAmount.create({
      data: {
        organizationId: testOrgId,
        waybillId: waybill.id,
        rawExcelAmount: 30_000_000n,
        roundedAmount: 30_000_000n,
        surchargeAmount: 700_000n,
        amount: 30_700_000n,
        isCurrent: true,
      },
    });

    // 1. Attempting to submit payment in ENFORCED mode without accepting commitment MUST fail
    await expect(
      submitWaybillPayment({
        organizationId: testOrgId,
        waybillId: waybill.id,
        method: "CARD_TO_CARD",
        amount: 30_700_000n,
        actor: { actorType: "DRIVER" },
        enforcementMode: "ENFORCED",
      })
    ).rejects.toThrow(CommitmentNotAcceptedError);

    // 2. Driver reads and signs commitment
    await acceptDriverCommitment({
      organizationId: testOrgId,
      waybillId: waybill.id,
      commitmentVersionId: testCommitmentVersionId,
      contentHash: "hash-signed-driver-1",
      renderedText: "متن کامل تعهدنامه بارنامه شماره فلان...",
      actor: { actorType: "DRIVER" },
    });

    // Verify waybill commitmentStatus is now ACCEPTED
    const updatedWaybill = await prisma.waybill.findUnique({
      where: { id: waybill.id },
    });
    expect(updatedWaybill?.commitmentStatus).toBe("ACCEPTED");

    // 3. Now driver submits payment -> SUCCESS
    const payment = await submitWaybillPayment({
      organizationId: testOrgId,
      waybillId: waybill.id,
      method: "CARD_TO_CARD",
      amount: 30_700_000n,
      actor: { actorType: "DRIVER" },
      enforcementMode: "ENFORCED",
    });

    expect(payment.id).toBeDefined();
    expect(payment.status).toBe("SUBMITTED");
  });

  it("Invariant I-2: Payment cannot be submitted on CANCELLED waybills", async () => {
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: testOrgId,
        waybillNumber: `WB-CANCELLED-${Date.now()}`,
        driverNameRaw: "بهرام راننده",
        driverMobileRaw: "09126667788",
        issueDate: new Date(),
        shipmentStatus: "CANCELLED",
        commitmentStatus: "ACCEPTED",
      },
    });

    await prisma.waybillAmount.create({
      data: {
        organizationId: testOrgId,
        waybillId: waybill.id,
        rawExcelAmount: 10_000_000n,
        roundedAmount: 10_000_000n,
        surchargeAmount: 0n,
        amount: 10_000_000n,
        isCurrent: true,
      },
    });

    await expect(
      submitWaybillPayment({
        organizationId: testOrgId,
        waybillId: waybill.id,
        method: "CARD_TO_CARD",
        amount: 10_000_000n,
        actor: { actorType: "DRIVER" },
        enforcementMode: "ENFORCED",
      })
    ).rejects.toThrow(WaybillNotActiveError);
  });

  it("canReleaseAndGrantDownload: evaluates all conditions and grants download atomically", async () => {
    // 1. Unmet conditions evaluation
    const blockedEval = evaluateReleaseConditions({
      shipmentStatus: "DRIVER_VIEWED",
      documentStatus: "NOT_UPLOADED",
      paymentStatus: "NOT_SUBMITTED",
      commitmentStatus: "PENDING",
      releaseStatus: "BLOCKED",
    });
    expect(blockedEval.canRelease).toBe(false);
    expect(blockedEval.unmetConditions).toContain("DOCUMENT_NOT_VERIFIED");
    expect(blockedEval.unmetConditions).toContain("PAYMENT_NOT_SETTLED");
    expect(blockedEval.unmetConditions).toContain("COMMITMENT_NOT_ACCEPTED");
    expect(blockedEval.unmetConditions).toContain("RELEASE_NOT_AUTHORIZED");

    // 2. Complete waybill lifecycle to AUTHORIZED
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: testOrgId,
        waybillNumber: `WB-RELEASE-${Date.now()}`,
        driverNameRaw: "سهراب راننده",
        driverMobileRaw: "09127778899",
        issueDate: new Date(),
        documentStatus: "VERIFIED",
        paymentStatus: "APPROVED",
        commitmentStatus: "ACCEPTED",
        releaseStatus: "AUTHORIZED",
      },
    });

    // Attach PDF document
    const doc = await prisma.document.create({
      data: {
        organizationId: testOrgId,
        waybillId: waybill.id,
        documentType: "WAYBILL_PDF",
        storageKey: `organizations/${testOrgId}/waybills/${waybill.id}/doc.pdf`,
        fileSize: 102400,
        mimeType: "application/pdf",
        sha256Hash: "pdf-hash-123",
        matchingStatus: "AUTO_MATCHED",
      },
    });

    // Grant download
    const grant = await canReleaseAndGrantDownload({
      organizationId: testOrgId,
      waybillId: waybill.id,
      ip: "127.0.0.1",
    });

    expect(grant.granted).toBe(true);
    expect(grant.unmetConditions.length).toBe(0);
    expect(grant.document?.id).toBe(doc.id);

    // Verify atomic state transition: AUTHORIZED -> RELEASED
    const updatedWaybill = await prisma.waybill.findUnique({
      where: { id: waybill.id },
    });
    expect(updatedWaybill?.releaseStatus).toBe("RELEASED");

    // Verify document access event logged
    const accessEvent = await prisma.documentAccessEvent.findFirst({
      where: { waybillId: waybill.id, documentId: doc.id },
    });
    expect(accessEvent).toBeDefined();
    expect(accessEvent?.accessType).toBe("DOWNLOAD");
  });
});
