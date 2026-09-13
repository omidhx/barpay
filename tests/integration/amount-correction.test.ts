import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { correctWaybillAmount } from "@/modules/waybills/amount-correction-service";
import { reviewPayment } from "@/modules/payments/review/payment-review-service";
import { AppError } from "@/lib/errors/exceptions";

describe("Amount Correction & Residual Payment (PostgreSQL 16) — business-rules.md §3, §7 & master-spec §6.5", () => {
  let orgId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: `تست اصلاح مبلغ ${Date.now()}`,
        slug: `correction-org-${Date.now()}`,
      },
    });
    orgId = org.id;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  it("enforces mandatory reason for amount correction and fails if reason is empty", async () => {
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: orgId,
        waybillNumber: `WB-REASON-TEST-${Date.now()}`,
        driverNameRaw: "راننده بدون دلیل",
        driverMobileRaw: "09121110010",
        issueDate: new Date(),
        paymentStatus: "APPROVED",
      },
    });

    const initialAmount = await prisma.waybillAmount.create({
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
      data: { currentAmountId: initialAmount.id },
    });

    // Attempting correction with empty reason must fail
    try {
      await correctWaybillAmount({
        organizationId: orgId,
        waybillId: waybill.id,
        newAmount: BigInt(60000000),
        reason: "   ",
        actor: { actorType: "USER", actorId: "operator-1" },
      });
      expect.fail("Expected reason required error");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("AMOUNT_CORRECTION_REASON_REQUIRED");
    }
  });

  it("calculates residual without re-rounding, transitions to RESIDUAL_DUE, and links residual payment", async () => {
    // 1. Waybill initially paid 80,700,000 Rials
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: orgId,
        waybillNumber: `WB-RESIDUAL-${Date.now()}`,
        driverNameRaw: "راننده مابقی",
        driverMobileRaw: "09121110011",
        issueDate: new Date(),
        documentStatus: "VERIFIED",
        commitmentStatus: "ACCEPTED",
        paymentStatus: "APPROVED",
        releaseStatus: "ELIGIBLE",
      },
    });

    const initialAmount = await prisma.waybillAmount.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        rawExcelAmount: BigInt(80686445),
        roundedAmount: BigInt(80700000),
        surchargeAmount: BigInt(0),
        amount: BigInt(80700000),
        isCurrent: true,
        status: "APPROVED",
      },
    });

    await prisma.waybill.update({
      where: { id: waybill.id },
      data: { currentAmountId: initialAmount.id },
    });

    // Initial approved payment
    const parentPayment = await prisma.payment.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        waybillAmountId: initialAmount.id,
        method: "CARD_TO_CARD",
        amount: BigInt(80700000),
        status: "APPROVED",
        reviewedBy: "reviewer-1",
        reviewedAt: new Date(),
      },
    });

    // 2. Correct amount to 95,123,456 Rials with reason
    // Residual must be exactly 95,123,456 - 80,700,000 = 14,423,456 Rials (NEVER re-rounded)
    const correctionResult = await correctWaybillAmount({
      organizationId: orgId,
      waybillId: waybill.id,
      newAmount: BigInt(95123456),
      reason: "افزایش کرایه و هزینه بارگیری طبق توافق جدید",
      actor: { actorType: "USER", actorId: "operator-1" },
    });

    expect(correctionResult.success).toBe(true);
    expect(correctionResult.residualAmount).toBe(BigInt(14423456));
    expect(correctionResult.paymentStatus).toBe("RESIDUAL_DUE");
    expect(correctionResult.releaseStatus).toBe("BLOCKED"); // Release is blocked until residual is paid

    // Verify DB state
    const waybillAfterCorrection = await prisma.waybill.findUnique({
      where: { id: waybill.id },
      include: { amounts: { where: { isCurrent: true } } },
    });
    expect(waybillAfterCorrection?.paymentStatus).toBe("RESIDUAL_DUE");
    expect(waybillAfterCorrection?.releaseStatus).toBe("BLOCKED");
    expect(waybillAfterCorrection?.amounts[0].amount).toBe(BigInt(95123456));
    expect(waybillAfterCorrection?.amounts[0].reason).toBe("افزایش کرایه و هزینه بارگیری طبق توافق جدید");

    // 3. Driver submits residual payment linking to parentPayment
    const residualPayment = await prisma.payment.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        parentPaymentId: parentPayment.id,
        isResidual: true,
        waybillAmountId: correctionResult.newWaybillAmountId,
        method: "CARD_TO_CARD",
        amount: BigInt(14423456),
        status: "SUBMITTED",
        version: 1,
      },
    });

    // 4. Operator reviews and approves the residual payment
    const reviewResult = await reviewPayment({
      organizationId: orgId,
      paymentId: residualPayment.id,
      decision: "APPROVED",
      expectedVersion: 1,
      reviewerId: "reviewer-2",
      actor: { actorType: "USER", actorId: "reviewer-2" },
    });

    expect(reviewResult.success).toBe(true);
    expect(reviewResult.waybillStatus).toBe("APPROVED");
    expect(reviewResult.releaseStatus).toBe("ELIGIBLE"); // Release is unblocked!
  });

  it("transitions to DISCREPANCY_REVIEW on overpayment / surplus correction", async () => {
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: orgId,
        waybillNumber: `WB-OVERPAY-CORR-${Date.now()}`,
        driverNameRaw: "راننده اضافه‌پرداخت",
        driverMobileRaw: "09121110012",
        issueDate: new Date(),
        paymentStatus: "APPROVED",
      },
    });

    const initialAmount = await prisma.waybillAmount.create({
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
      data: { currentAmountId: initialAmount.id },
    });

    await prisma.payment.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        waybillAmountId: initialAmount.id,
        method: "CARD_TO_CARD",
        amount: BigInt(50000000),
        status: "APPROVED",
      },
    });

    // Correct amount down to 40,000,000 (total paid 50,000,000 > new 40,000,000)
    const result = await correctWaybillAmount({
      organizationId: orgId,
      waybillId: waybill.id,
      newAmount: BigInt(40000000),
      reason: "کسر خسارت وارده به بار",
      actor: { actorType: "USER", actorId: "operator-1" },
    });

    expect(result.success).toBe(true);
    expect(result.paymentStatus).toBe("DISCREPANCY_REVIEW");
  });
});
