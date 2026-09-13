import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { recordRefund, approveRefund, rejectRefund } from "@/modules/payments/refunds/refund-service";
import { AppError } from "@/lib/errors/exceptions";

describe("Refund Management & Maker-Checker Separation (PostgreSQL 16) — business-rules.md §8 & master-spec §6.9", () => {
  let orgId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: `تست بازگشت وجه ${Date.now()}`,
        slug: `refund-org-${Date.now()}`,
      },
    });
    orgId = org.id;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  it("enforces maker-checker rule: creator cannot approve their own refund", async () => {
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: orgId,
        waybillNumber: `WB-REF-MC-${Date.now()}`,
        driverNameRaw: "راننده تفکیک وظایف",
        driverMobileRaw: "09121110020",
        issueDate: new Date(),
        paymentStatus: "APPROVED",
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

    await prisma.payment.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        waybillAmountId: amountRecord.id,
        method: "CARD_TO_CARD",
        amount: BigInt(50000000),
        status: "APPROVED",
      },
    });

    // 1. Operator-A records refund
    const refund = await recordRefund({
      organizationId: orgId,
      waybillId: waybill.id,
      amount: BigInt(20000000),
      reason: "اضافه‌واریزی راننده",
      actor: { actorType: "USER", actorId: "operator-alice" },
    });

    expect(refund.status).toBe("RECORDED");
    expect(refund.recordedBy).toBe("operator-alice");

    // 2. Operator-A attempts to approve their own refund -> must fail with REFUND_MAKER_CHECKER_VIOLATION
    try {
      await approveRefund({
        organizationId: orgId,
        refundId: refund.id,
        supervisorId: "operator-alice",
        actor: { actorType: "USER", actorId: "operator-alice" },
      });
      expect.fail("Expected REFUND_MAKER_CHECKER_VIOLATION");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("REFUND_MAKER_CHECKER_VIOLATION");
      expect((err as AppError).httpStatus).toBe(403);
    }

    // 3. Supervisor-B approves the refund -> succeeds!
    const approved = await approveRefund({
      organizationId: orgId,
      refundId: refund.id,
      supervisorId: "supervisor-bob",
      actor: { actorType: "USER", actorId: "supervisor-bob" },
    });

    expect(approved.status).toBe("SUPERVISOR_APPROVED");
    expect(approved.approvedBy).toBe("supervisor-bob");

    const updatedWaybill = await prisma.waybill.findUnique({ where: { id: waybill.id } });
    expect(updatedWaybill?.paymentStatus).toBe("REFUND_SETTLED");
  });

  it("enforces database trigger trg_check_refund_ceiling preventing refunds beyond approved payments", async () => {
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: orgId,
        waybillNumber: `WB-REF-CEIL-${Date.now()}`,
        driverNameRaw: "راننده سقف بازگشت",
        driverMobileRaw: "09121110021",
        issueDate: new Date(),
        paymentStatus: "APPROVED",
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

    await prisma.waybill.update({
      where: { id: waybill.id },
      data: { currentAmountId: amountRecord.id },
    });

    // Approved payment of 10,000,000 Rials
    await prisma.payment.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        waybillAmountId: amountRecord.id,
        method: "CARD_TO_CARD",
        amount: BigInt(10000000),
        status: "APPROVED",
      },
    });

    // Attempting to record refund of 15,000,000 Rials (exceeds 10,000,000 Rials)
    await expect(
      recordRefund({
        organizationId: orgId,
        waybillId: waybill.id,
        amount: BigInt(15000000),
        reason: "مبلغ غیرمجاز فراتر از سقف",
        actor: { actorType: "USER", actorId: "operator-charlie" },
      })
    ).rejects.toThrow(/REFUND_CEILING_EXCEEDED/);
  });

  it("allows supervisor to reject a refund with mandatory reason", async () => {
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: orgId,
        waybillNumber: `WB-REF-REJ-${Date.now()}`,
        driverNameRaw: "راننده رد بازگشت",
        driverMobileRaw: "09121110022",
        issueDate: new Date(),
        paymentStatus: "APPROVED",
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

    await prisma.payment.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        waybillAmountId: amountRecord.id,
        method: "CARD_TO_CARD",
        amount: BigInt(20000000),
        status: "APPROVED",
      },
    });

    const refund = await recordRefund({
      organizationId: orgId,
      waybillId: waybill.id,
      amount: BigInt(5000000),
      reason: "درخواست نامعتبر",
      actor: { actorType: "USER", actorId: "operator-dave" },
    });

    // Rejection without reason fails
    try {
      await rejectRefund({
        organizationId: orgId,
        refundId: refund.id,
        supervisorId: "supervisor-eve",
        rejectionReason: "   ",
        actor: { actorType: "USER", actorId: "supervisor-eve" },
      });
      expect.fail("Expected REJECTION_REASON_REQUIRED");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("REJECTION_REASON_REQUIRED");
    }

    // Rejection with reason succeeds
    const rejected = await rejectRefund({
      organizationId: orgId,
      refundId: refund.id,
      supervisorId: "supervisor-eve",
      rejectionReason: "مستندات واریزی ارائه نشد",
      actor: { actorType: "USER", actorId: "supervisor-eve" },
    });

    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectionReason).toBe("مستندات واریزی ارائه نشد");
  });
});
