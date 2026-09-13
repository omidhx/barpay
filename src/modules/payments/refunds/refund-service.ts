import { prisma } from "@/lib/db/client";
import { AppError } from "@/lib/errors/exceptions";
import { createAuditLogEntry } from "@/lib/audit/audit-logger";
import { RefundStatus } from "@prisma/client";

export interface RecordRefundInput {
  organizationId: string;
  waybillId: string;
  paymentId?: string;
  amount: bigint;
  reason: string;
  actor: {
    actorType: "USER" | "SYSTEM";
    actorId: string;
    ip?: string | null;
    userAgent?: string | null;
    correlationId?: string | null;
  };
}

export interface ApproveRefundInput {
  organizationId: string;
  refundId: string;
  supervisorId: string;
  actor: {
    actorType: "USER" | "SYSTEM";
    actorId: string;
    ip?: string | null;
    userAgent?: string | null;
    correlationId?: string | null;
  };
}

export interface RejectRefundInput {
  organizationId: string;
  refundId: string;
  supervisorId: string;
  rejectionReason: string;
  actor: {
    actorType: "USER" | "SYSTEM";
    actorId: string;
    ip?: string | null;
    userAgent?: string | null;
    correlationId?: string | null;
  };
}

export interface RefundItem {
  id: string;
  organizationId: string;
  waybillId: string;
  waybillNumber: string;
  paymentId?: string | null;
  amount: bigint;
  reason: string;
  status: RefundStatus;
  recordedBy: string;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  rejectionReason?: string | null;
  createdAt: Date;
}

/**
 * Lists refund records for an organization.
 */
export async function listRefunds(filters: {
  organizationId: string;
  waybillId?: string;
  status?: RefundStatus;
  limit?: number;
  offset?: number;
}): Promise<{ items: RefundItem[]; total: number }> {
  const { organizationId, waybillId, status, limit = 50, offset = 0 } = filters;

  const where = {
    organizationId,
    ...(waybillId ? { waybillId } : {}),
    ...(status ? { status } : {}),
  };

  const [refunds, total] = await Promise.all([
    prisma.paymentRefund.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.paymentRefund.count({ where }),
  ]);

  // Fetch waybill numbers
  const waybillIds = Array.from(new Set(refunds.map((r) => r.waybillId)));
  const waybills = await prisma.waybill.findMany({
    where: { id: { in: waybillIds } },
    select: { id: true, waybillNumber: true },
  });
  const waybillMap = new Map(waybills.map((w) => [w.id, w.waybillNumber]));

  const items: RefundItem[] = refunds.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    waybillId: r.waybillId,
    waybillNumber: waybillMap.get(r.waybillId) ?? "نامشخص",
    paymentId: r.paymentId,
    amount: r.amount,
    reason: r.reason,
    status: r.status,
    recordedBy: r.recordedBy,
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt,
    rejectionReason: r.rejectionReason,
    createdAt: r.createdAt,
  }));

  return { items, total };
}

/**
 * Records a new refund in RECORDED status (Maker step).
 * Enforces:
 * 1. Reason is mandatory.
 * 2. Database trigger trg_check_refund_ceiling ensures total refunds <= total approved payments.
 * 3. Waybill payment_status becomes REFUND_RECORDED; release_status remains blocked.
 * 4. Audit logging.
 */
export async function recordRefund(input: RecordRefundInput) {
  const { organizationId, waybillId, paymentId, amount, reason, actor } = input;

  if (!reason || reason.trim().length === 0) {
    throw new AppError("REJECTION_REASON_REQUIRED", "درج دلیل برای ثبت بازگشت وجه الزامی است.");
  }

  if (amount <= BigInt(0)) {
    throw new AppError("VALIDATION_ERROR", "مبلغ بازگشت وجه باید یک عدد مثبت به ریال باشد.");
  }

  return prisma.$transaction(async (tx) => {
    const waybill = await tx.waybill.findFirst({
      where: { id: waybillId, organizationId },
    });

    if (!waybill) {
      throw new AppError("NOT_FOUND", "بارنامه مورد نظر یافت نشد.");
    }

    // Insert record in payment_refunds (Triggers trg_check_refund_ceiling with advisory lock)
    const refund = await tx.paymentRefund.create({
      data: {
        organizationId,
        waybillId,
        paymentId: paymentId || null,
        amount,
        reason: reason.trim(),
        status: "RECORDED",
        recordedBy: actor.actorId,
      },
    });

    // Update waybill status to REFUND_RECORDED
    await tx.waybill.update({
      where: { id: waybillId },
      data: {
        paymentStatus: "REFUND_RECORDED",
        version: { increment: 1 },
      },
    });

    // Audit log
    await createAuditLogEntry(tx, {
      organizationId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "REFUND_RECORDED",
      entityType: "PAYMENT_REFUND",
      entityId: refund.id,
      beforeJson: null,
      afterJson: {
        waybillId,
        amount: amount.toString(),
        reason: reason.trim(),
        status: "RECORDED",
      },
      correlationId: actor.correlationId,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return refund;
  });
}

/**
 * Approves a recorded refund (Checker step).
 * Enforces:
 * 1. Maker-Checker rule: approvedBy !== recordedBy.
 * 2. Refund must be in RECORDED status.
 * 3. Waybill payment_status becomes REFUND_SETTLED. Release remains BLOCKED (Invariant I-15).
 * 4. Audit logging.
 */
export async function approveRefund(input: ApproveRefundInput) {
  const { organizationId, refundId, supervisorId, actor } = input;

  return prisma.$transaction(async (tx) => {
    const refund = await tx.paymentRefund.findFirst({
      where: { id: refundId, organizationId },
    });

    if (!refund) {
      throw new AppError("NOT_FOUND", "رکورد بازگشت وجه یافت نشد.");
    }

    if (refund.status !== "RECORDED") {
      throw new AppError("REFUND_ALREADY_SETTLED", "این رکورد بازگشت وجه قبلاً تعیین وضعیت شده است.");
    }

    // Maker-Checker Separation (master-spec §6.9)
    if (refund.recordedBy === supervisorId) {
      throw new AppError(
        "REFUND_MAKER_CHECKER_VIOLATION",
        "کاربر ثبت‌کننده بازگشت وجه نمی‌تواند خودش آن را تأیید کند. تأیید باید توسط سرپرست دیگری انجام شود.",
        actor.correlationId ?? undefined
      );
    }

    const updated = await tx.paymentRefund.update({
      where: { id: refundId },
      data: {
        status: "SUPERVISOR_APPROVED",
        approvedBy: supervisorId,
        approvedAt: new Date(),
      },
    });

    // Update waybill status to REFUND_SETTLED
    await tx.waybill.update({
      where: { id: refund.waybillId },
      data: {
        paymentStatus: "REFUND_SETTLED",
        version: { increment: 1 },
      },
    });

    // Audit log
    await createAuditLogEntry(tx, {
      organizationId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "REFUND_APPROVED",
      entityType: "PAYMENT_REFUND",
      entityId: refundId,
      beforeJson: { status: refund.status },
      afterJson: {
        status: "SUPERVISOR_APPROVED",
        approvedBy: supervisorId,
        waybillStatus: "REFUND_SETTLED",
      },
      correlationId: actor.correlationId,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return updated;
  });
}

/**
 * Rejects a recorded refund (Checker step).
 * Enforces:
 * 1. Reason is mandatory.
 * 2. Refund must be in RECORDED status.
 * 3. Reverts waybill payment_status back if no other recorded refunds exist.
 * 4. Audit logging.
 */
export async function rejectRefund(input: RejectRefundInput) {
  const { organizationId, refundId, supervisorId, rejectionReason, actor } = input;

  if (!rejectionReason || rejectionReason.trim().length === 0) {
    throw new AppError("REJECTION_REASON_REQUIRED", "درج دلیل برای رد بازگشت وجه الزامی است.");
  }

  return prisma.$transaction(async (tx) => {
    const refund = await tx.paymentRefund.findFirst({
      where: { id: refundId, organizationId },
    });

    if (!refund) {
      throw new AppError("NOT_FOUND", "رکورد بازگشت وجه یافت نشد.");
    }

    if (refund.status !== "RECORDED") {
      throw new AppError("REFUND_ALREADY_SETTLED", "این رکورد بازگشت وجه قبلاً تعیین وضعیت شده است.");
    }

    const updated = await tx.paymentRefund.update({
      where: { id: refundId },
      data: {
        status: "REJECTED",
        rejectionReason: rejectionReason.trim(),
        approvedBy: supervisorId,
        approvedAt: new Date(),
      },
    });

    // Check if other recorded refunds remain for this waybill
    const otherRecorded = await tx.paymentRefund.findFirst({
      where: {
        waybillId: refund.waybillId,
        status: "RECORDED",
        id: { not: refundId },
      },
    });

    if (!otherRecorded) {
      // Revert to APPROVED if approved payments exist
      const approvedCount = await tx.payment.count({
        where: { waybillId: refund.waybillId, status: "APPROVED" },
      });

      await tx.waybill.update({
        where: { id: refund.waybillId },
        data: {
          paymentStatus: approvedCount > 0 ? "APPROVED" : "SUBMITTED",
          version: { increment: 1 },
        },
      });
    }

    // Audit log
    await createAuditLogEntry(tx, {
      organizationId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "REFUND_REJECTED",
      entityType: "PAYMENT_REFUND",
      entityId: refundId,
      beforeJson: { status: refund.status },
      afterJson: {
        status: "REJECTED",
        rejectionReason: rejectionReason.trim(),
        supervisorId,
      },
      correlationId: actor.correlationId,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return updated;
  });
}
