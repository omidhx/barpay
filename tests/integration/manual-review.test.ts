import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { reviewPayment } from "@/modules/payments/review/payment-review-service";
import { AppError, PaymentStateConflictError } from "@/lib/errors/exceptions";

describe("Manual Payment Review & Concurrency (PostgreSQL 16) — business-rules.md §7 & master-spec §6.5", () => {
  let orgId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: `تست بازبینی پرداخت ${Date.now()}`,
        slug: `review-org-${Date.now()}`,
      },
    });
    orgId = org.id;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  it("enforces mandatory concurrent-review race test: first reviewer wins, second gets 409 PAYMENT_STATE_CONFLICT", async () => {
    // 1. Setup waybill and current amount
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: orgId,
        waybillNumber: `WB-RACE-${Date.now()}`,
        driverNameRaw: "راننده مسابقه",
        driverMobileRaw: "09121110001",
        issueDate: new Date(),
        shipmentStatus: "DRIVER_VIEWED",
        documentStatus: "VERIFIED",
        commitmentStatus: "ACCEPTED",
        paymentStatus: "SUBMITTED",
        releaseStatus: "BLOCKED",
      },
    });

    const amountRecord = await prisma.waybillAmount.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        rawExcelAmount: BigInt(50000000),
        roundedAmount: BigInt(50000000),
        surchargeAmount: BigInt(0),
        amount: BigInt(50000000),
        isCurrent: true,
        status: "APPROVED",
      },
    });

    await prisma.waybill.update({
      where: { id: waybill.id },
      data: { currentAmountId: amountRecord.id },
    });

    // Create submitted payment
    const payment = await prisma.payment.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        waybillAmountId: amountRecord.id,
        method: "CARD_TO_CARD",
        amount: BigInt(50000000),
        status: "SUBMITTED",
        version: 1,
      },
    });

    // 2. Simulate two concurrent reviewers racing to approve the same payment
    const reviewer1 = reviewPayment({
      organizationId: orgId,
      paymentId: payment.id,
      decision: "APPROVED",
      expectedVersion: 1,
      reviewerId: "reviewer-alice",
      actor: { actorType: "USER", actorId: "reviewer-alice" },
    });

    const reviewer2 = reviewPayment({
      organizationId: orgId,
      paymentId: payment.id,
      decision: "APPROVED",
      expectedVersion: 1,
      reviewerId: "reviewer-bob",
      actor: { actorType: "USER", actorId: "reviewer-bob" },
    });

    const results = await Promise.allSettled([reviewer1, reviewer2]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one winner succeeds and the other fails with 409 PAYMENT_STATE_CONFLICT
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const winner = (fulfilled[0] as PromiseFulfilledResult<any>).value;
    expect(winner.success).toBe(true);

    const loserError = (rejected[0] as PromiseRejectedResult).reason;
    expect(loserError).toBeInstanceOf(AppError);
    expect((loserError as AppError).code).toBe("PAYMENT_STATE_CONFLICT");
    expect((loserError as AppError).httpStatus).toBe(409);

    // Waybill must now be in APPROVED and ELIGIBLE (since doc was VERIFIED and commitment ACCEPTED)
    const updatedWaybill = await prisma.waybill.findUnique({ where: { id: waybill.id } });
    expect(updatedWaybill?.paymentStatus).toBe("APPROVED");
    expect(updatedWaybill?.releaseStatus).toBe("ELIGIBLE");
  });

  it("enforces guard AMOUNT_CHANGED: blocks normal review if waybill amount changed since payment submission", async () => {
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: orgId,
        waybillNumber: `WB-AMT-CHG-${Date.now()}`,
        driverNameRaw: "راننده تغییر مبلغ",
        driverMobileRaw: "09121110002",
        issueDate: new Date(),
        paymentStatus: "SUBMITTED",
      },
    });

    // Old amount record
    const oldAmount = await prisma.waybillAmount.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        rawExcelAmount: BigInt(30000000),
        roundedAmount: BigInt(30000000),
        surchargeAmount: BigInt(0),
        amount: BigInt(30000000),
        isCurrent: false,
        status: "SUPERSEDED",
      },
    });

    // New current amount record
    const newAmount = await prisma.waybillAmount.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        rawExcelAmount: BigInt(40000000),
        roundedAmount: BigInt(40000000),
        surchargeAmount: BigInt(0),
        amount: BigInt(40000000),
        isCurrent: true,
        status: "APPROVED",
      },
    });

    await prisma.waybill.update({
      where: { id: waybill.id },
      data: { currentAmountId: newAmount.id },
    });

    // Payment submitted against the old amount
    const payment = await prisma.payment.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        waybillAmountId: oldAmount.id,
        method: "CARD_TO_CARD",
        amount: BigInt(30000000),
        status: "SUBMITTED",
        version: 1,
      },
    });

    // Attempting normal approval must be rejected with AMOUNT_CHANGED
    try {
      await reviewPayment({
        organizationId: orgId,
        paymentId: payment.id,
        decision: "APPROVED",
        expectedVersion: 1,
        reviewerId: "reviewer-charlie",
        actor: { actorType: "USER", actorId: "reviewer-charlie" },
      });
      expect.fail("Expected AMOUNT_CHANGED error");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("AMOUNT_CHANGED");
      expect((err as AppError).httpStatus).toBe(409);
    }
  });

  it("enforces guard OVERPAYMENT_REQUIRES_DISCREPANCY: blocks approval if payment exceeds remaining balance", async () => {
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: orgId,
        waybillNumber: `WB-OVERPAY-${Date.now()}`,
        driverNameRaw: "راننده اضافه پرداخت",
        driverMobileRaw: "09121110003",
        issueDate: new Date(),
        paymentStatus: "SUBMITTED",
      },
    });

    const amountRecord = await prisma.waybillAmount.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        rawExcelAmount: BigInt(20000000),
        roundedAmount: BigInt(20000000),
        surchargeAmount: BigInt(0),
        amount: BigInt(20000000),
        isCurrent: true,
        status: "APPROVED",
      },
    });

    await prisma.waybill.update({
      where: { id: waybill.id },
      data: { currentAmountId: amountRecord.id },
    });

    // Payment for 25,000,000 (exceeds 20,000,000)
    const payment = await prisma.payment.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        waybillAmountId: amountRecord.id,
        method: "CARD_TO_CARD",
        amount: BigInt(25000000),
        status: "SUBMITTED",
        version: 1,
      },
    });

    try {
      await reviewPayment({
        organizationId: orgId,
        paymentId: payment.id,
        decision: "APPROVED",
        expectedVersion: 1,
        reviewerId: "reviewer-dave",
        actor: { actorType: "USER", actorId: "reviewer-dave" },
      });
      expect.fail("Expected OVERPAYMENT_REQUIRES_DISCREPANCY error");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("OVERPAYMENT_REQUIRES_DISCREPANCY");
      expect((err as AppError).httpStatus).toBe(422);
    }
  });

  it("requires rejectionReason when decision is REJECTED", async () => {
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: orgId,
        waybillNumber: `WB-REJ-${Date.now()}`,
        driverNameRaw: "راننده رد پرداخت",
        driverMobileRaw: "09121110004",
        issueDate: new Date(),
        paymentStatus: "SUBMITTED",
      },
    });

    const amountRecord = await prisma.waybillAmount.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        rawExcelAmount: BigInt(10000000),
        roundedAmount: BigInt(10000000),
        surchargeAmount: BigInt(0),
        amount: BigInt(10000000),
        isCurrent: true,
        status: "APPROVED",
      },
    });

    const payment = await prisma.payment.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        waybillAmountId: amountRecord.id,
        method: "CARD_TO_CARD",
        amount: BigInt(10000000),
        status: "SUBMITTED",
        version: 1,
      },
    });

    // Attempt rejection without reason
    try {
      await reviewPayment({
        organizationId: orgId,
        paymentId: payment.id,
        decision: "REJECTED",
        expectedVersion: 1,
        reviewerId: "reviewer-eve",
        actor: { actorType: "USER", actorId: "reviewer-eve" },
      });
      expect.fail("Expected REJECTION_REASON_REQUIRED error");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("REJECTION_REASON_REQUIRED");
    }

    // Rejection with reason succeeds
    const rejectResult = await reviewPayment({
      organizationId: orgId,
      paymentId: payment.id,
      decision: "REJECTED",
      rejectionReason: "فیش واریزی ناخوانا است",
      expectedVersion: 1,
      reviewerId: "reviewer-eve",
      actor: { actorType: "USER", actorId: "reviewer-eve" },
    });

    expect(rejectResult.success).toBe(true);
    expect(rejectResult.status).toBe("REJECTED");
    expect(rejectResult.waybillStatus).toBe("REJECTED");

    const updatedPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(updatedPayment?.status).toBe("REJECTED");
    expect(updatedPayment?.rejectionReason).toBe("فیش واریزی ناخوانا است");
  });
});
