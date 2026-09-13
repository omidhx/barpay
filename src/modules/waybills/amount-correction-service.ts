import { prisma } from "@/lib/db/client";
import { AppError } from "@/lib/errors/exceptions";
import { createAuditLogEntry } from "@/lib/audit/audit-logger";
import { PaymentStatus, ReleaseStatus } from "@prisma/client";

export interface CorrectWaybillAmountInput {
  organizationId: string;
  waybillId: string;
  newAmount: bigint;
  reason: string;
  actor: {
    actorType: "USER" | "SYSTEM";
    actorId: string;
    ip?: string | null;
    userAgent?: string | null;
    correlationId?: string | null;
  };
}

export interface CorrectWaybillAmountResult {
  success: boolean;
  waybillId: string;
  previousAmount: bigint;
  newAmount: bigint;
  totalApprovedPayments: bigint;
  residualAmount: bigint;
  paymentStatus: PaymentStatus;
  releaseStatus: ReleaseStatus;
  newWaybillAmountId: string;
}

/**
 * Corrects the payable amount of a waybill after payment (Process 6.5).
 * Enforces:
 * 1. Reason is mandatory (physical constraint check_waybill_amounts_reason).
 * 2. Residual is NEVER re-rounded: exactly (newAmount - totalApproved).
 * 3. Underpayment (newAmount > totalApproved) -> RESIDUAL_DUE, release blocked.
 * 4. Overpayment (newAmount < totalApproved) -> DISCREPANCY_REVIEW.
 * 5. Exactly one is_current = true via Partial Unique Index idx_waybill_amounts_current.
 * 6. Audit log entry AMOUNT_CORRECTED with before/after state.
 */
export async function correctWaybillAmount(
  input: CorrectWaybillAmountInput
): Promise<CorrectWaybillAmountResult> {
  const { organizationId, waybillId, newAmount, reason, actor } = input;

  if (!reason || reason.trim().length === 0) {
    throw new AppError(
      "AMOUNT_CORRECTION_REASON_REQUIRED",
      "درج دلیل برای اصلاح مبلغ بارنامه الزامی است.",
      actor.correlationId ?? undefined
    );
  }

  if (newAmount <= BigInt(0)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "مبلغ اصلاح‌شده باید یک عدد مثبت به ریال باشد.",
      actor.correlationId ?? undefined
    );
  }

  return prisma.$transaction(async (tx) => {
    // 1. Fetch waybill with current amount and approved payments
    const waybill = await tx.waybill.findFirst({
      where: { id: waybillId, organizationId },
      include: {
        amounts: { where: { isCurrent: true }, take: 1 },
        payments: { where: { status: "APPROVED" } },
      },
    });

    if (!waybill) {
      throw new AppError("NOT_FOUND", "بارنامه مورد نظر یافت نشد.");
    }

    if (waybill.shipmentStatus === "CANCELLED" || waybill.shipmentStatus === "ARCHIVED") {
      throw new AppError(
        "WAYBILL_NOT_ACTIVE",
        "امکان اصلاح مبلغ روی بارنامه باطل یا بایگانی‌شده وجود ندارد.",
        actor.correlationId ?? undefined
      );
    }

    const currentAmountRecord = waybill.amounts[0];
    const previousAmount = currentAmountRecord?.amount ?? BigInt(0);

    // Sum of all approved payments
    const totalApprovedPayments = waybill.payments.reduce(
      (sum, p) => sum + p.amount,
      BigInt(0)
    );

    // 2. Set previous amount record is_current = false
    if (currentAmountRecord) {
      await tx.waybillAmount.update({
        where: { id: currentAmountRecord.id },
        data: { isCurrent: false, status: "SUPERSEDED" },
      });
    }

    // 3. Create new WaybillAmount with source = OPERATOR_CORRECTION
    const newAmountRecord = await tx.waybillAmount.create({
      data: {
        organizationId,
        waybillId,
        rawExcelAmount: currentAmountRecord?.rawExcelAmount ?? newAmount,
        roundedAmount: currentAmountRecord?.roundedAmount ?? newAmount,
        surchargeAmount: currentAmountRecord?.surchargeAmount ?? BigInt(0),
        amount: newAmount,
        source: "OPERATOR_CORRECTION",
        reason: reason.trim(),
        isCurrent: true,
        status: "APPROVED",
        approvedBy: actor.actorId,
        approvedAt: new Date(),
      },
    });

    // 4. Calculate residual and determine new payment & release statuses
    let newPaymentStatus: PaymentStatus;
    let newReleaseStatus: ReleaseStatus = waybill.releaseStatus;
    let residualAmount = BigInt(0);

    if (newAmount > totalApprovedPayments) {
      // Case 1: Shortage / Underpayment (بدهی مابقی)
      // Residual is NEVER re-rounded (business-rules.md §3)
      residualAmount = newAmount - totalApprovedPayments;
      newPaymentStatus = "RESIDUAL_DUE";

      // Block release if it was eligible or authorized
      if (["ELIGIBLE", "AUTHORIZED"].includes(newReleaseStatus)) {
        newReleaseStatus = "BLOCKED";
      }
    } else if (newAmount < totalApprovedPayments) {
      // Case 2: Surplus / Overpayment (اضافه‌پرداخت)
      newPaymentStatus = "DISCREPANCY_REVIEW";
    } else {
      // Exactly matches approved payments
      newPaymentStatus = "APPROVED";
      const isDocVerified = waybill.documentStatus === "VERIFIED";
      const isCommitmentAccepted = ["ACCEPTED", "NOT_REQUIRED"].includes(waybill.commitmentStatus);

      if (isDocVerified && isCommitmentAccepted && waybill.releaseStatus === "BLOCKED") {
        newReleaseStatus = "ELIGIBLE";
      }
    }

    // 5. Update waybill with new current amount and statuses
    await tx.waybill.update({
      where: { id: waybillId },
      data: {
        currentAmountId: newAmountRecord.id,
        paymentStatus: newPaymentStatus,
        releaseStatus: newReleaseStatus,
        version: { increment: 1 },
      },
    });

    // 6. Record in immutable audit_logs
    await createAuditLogEntry(tx, {
      organizationId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "AMOUNT_CORRECTED",
      entityType: "WAYBILL",
      entityId: waybillId,
      beforeJson: {
        amountId: currentAmountRecord?.id,
        amount: previousAmount.toString(),
        paymentStatus: waybill.paymentStatus,
        releaseStatus: waybill.releaseStatus,
      },
      afterJson: {
        amountId: newAmountRecord.id,
        amount: newAmount.toString(),
        totalApprovedPayments: totalApprovedPayments.toString(),
        residualAmount: residualAmount.toString(),
        reason: reason.trim(),
        paymentStatus: newPaymentStatus,
        releaseStatus: newReleaseStatus,
      },
      correlationId: actor.correlationId,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return {
      success: true,
      waybillId,
      previousAmount,
      newAmount,
      totalApprovedPayments,
      residualAmount,
      paymentStatus: newPaymentStatus,
      releaseStatus: newReleaseStatus,
      newWaybillAmountId: newAmountRecord.id,
    };
  });
}
