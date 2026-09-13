import { ShipmentStatus, PaymentStatus, DocumentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { createAuditLogEntry } from "@/lib/audit/audit-logger";
import {
  PaymentStateConflictError,
  CommitmentNotAcceptedError,
  WaybillNotActiveError,
  AppError,
} from "@/lib/errors/exceptions";

export interface StateActor {
  actorType: "USER" | "DRIVER" | "SYSTEM";
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
}

// =============================================================================
// 1. SHIPMENT STATUS TRANSITIONS
// =============================================================================

const ALLOWED_SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  DRAFT: ["IMPORTED", "CANCELLED"],
  IMPORTED: ["VALIDATION_FAILED", "READY_FOR_DRIVER", "CANCELLED"],
  VALIDATION_FAILED: ["IMPORTED", "CANCELLED"],
  READY_FOR_DRIVER: ["DRIVER_NOTIFIED", "CANCELLED"],
  DRIVER_NOTIFIED: ["DRIVER_VIEWED", "CANCELLED"],
  DRIVER_VIEWED: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["ARCHIVED"],
  CANCELLED: [],
  ARCHIVED: [],
};

export interface TransitionShipmentInput {
  organizationId: string;
  waybillId: string;
  targetStatus: ShipmentStatus;
  expectedVersion: number;
  actor: StateActor;
  reason?: string;
}

export async function transitionWaybillShipmentStatus(input: TransitionShipmentInput) {
  const { organizationId, waybillId, targetStatus, expectedVersion, actor, reason } = input;

  return prisma.$transaction(async (tx) => {
    const current = await tx.waybill.findFirst({
      where: { id: waybillId, organizationId },
    });

    if (!current) {
      throw new AppError("NOT_FOUND", "بارنامه مورد نظر یافت نشد.");
    }

    if (current.shipmentStatus === targetStatus) {
      return { success: true, idempotent: true, waybill: current };
    }

    const allowed = ALLOWED_SHIPMENT_TRANSITIONS[current.shipmentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw new AppError(
        "INVALID_TRANSITION",
        `امکان گذار وضعیت از «${current.shipmentStatus}» به «${targetStatus}» وجود ندارد.`
      );
    }

    const updatedCount = await tx.waybill.updateMany({
      where: {
        id: waybillId,
        organizationId,
        version: expectedVersion,
        shipmentStatus: current.shipmentStatus,
      },
      data: {
        shipmentStatus: targetStatus,
        version: { increment: 1 },
      },
    });

    if (updatedCount.count === 0) {
      const fresh = await tx.waybill.findUnique({ where: { id: waybillId } });
      throw new AppError(
        "CONFLICT",
        `وضعیت بارنامه هم‌زمان تغییر یافته است. وضعیت جاری: ${fresh?.shipmentStatus}`
      );
    }

    await createAuditLogEntry(tx, {
      organizationId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: `SHIPMENT_STATUS_${targetStatus}`,
      entityType: "WAYBILL",
      entityId: waybillId,
      beforeJson: { status: current.shipmentStatus, version: expectedVersion },
      afterJson: { status: targetStatus, version: expectedVersion + 1, reason },
      correlationId: actor.correlationId,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return {
      success: true,
      idempotent: false,
      previousStatus: current.shipmentStatus,
      targetStatus,
      newVersion: expectedVersion + 1,
    };
  });
}

// =============================================================================
// 2. PAYMENT STATUS TRANSITIONS & REVIEWS
// =============================================================================

const ALLOWED_PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  NOT_REQUIRED: [],
  NOT_SUBMITTED: ["SUBMITTED", "APPROVED", "CANCELLED"],
  SUBMITTED: ["UNDER_REVIEW", "APPROVED", "REJECTED", "DISCREPANCY_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "DISCREPANCY_REVIEW", "CANCELLED"],
  APPROVED: ["RESIDUAL_DUE", "REFUND_RECORDED"],
  REJECTED: ["SUBMITTED", "CANCELLED"],
  DISCREPANCY_REVIEW: ["APPROVED", "REJECTED", "RESIDUAL_DUE", "REFUND_RECORDED"],
  RESIDUAL_DUE: ["SUBMITTED", "APPROVED"],
  REFUND_RECORDED: ["REFUND_SETTLED", "REJECTED"],
  REFUND_SETTLED: [],
  CANCELLED: [],
};

export interface TransitionPaymentInput {
  organizationId: string;
  paymentId: string;
  targetStatus: PaymentStatus;
  expectedVersion: number;
  actor: StateActor;
  rejectionReason?: string;
  notes?: string;
}

export async function transitionPaymentStatus(input: TransitionPaymentInput) {
  const {
    organizationId,
    paymentId,
    targetStatus,
    expectedVersion,
    actor,
    rejectionReason,
    notes,
  } = input;

  if (targetStatus === "REJECTED" && (!rejectionReason || rejectionReason.trim().length === 0)) {
    throw new AppError("VALIDATION_ERROR", "ثبت دلیل برای رد پرداخت الزامی است.");
  }

  return prisma.$transaction(async (tx) => {
    // 1. Fetch current payment with row-level intent
    const current = await tx.payment.findFirst({
      where: { id: paymentId, organizationId },
      include: { waybill: true },
    });

    if (!current) {
      throw new AppError("NOT_FOUND", "تراکنش پرداخت مورد نظر یافت نشد.");
    }

    // Idempotent success check
    if (current.status === targetStatus) {
      return { success: true, idempotent: true, payment: current };
    }

    // Incompatible transition check
    const allowed = ALLOWED_PAYMENT_TRANSITIONS[current.status] || [];
    if (!allowed.includes(targetStatus)) {
      throw new PaymentStateConflictError(current.status, targetStatus, actor.correlationId ?? undefined);
    }

    // 2. Conditional atomic update with optimistic locking
    const updateResult = await tx.payment.updateMany({
      where: {
        id: paymentId,
        organizationId,
        version: expectedVersion,
        status: current.status,
      },
      data: {
        status: targetStatus,
        version: { increment: 1 },
        reviewedBy: actor.actorId,
        reviewedAt: new Date(),
        rejectionReason: targetStatus === "REJECTED" ? rejectionReason : undefined,
      },
    });

    // 3. Race condition detection (Another reviewer won the race)
    if (updateResult.count === 0) {
      const latest = await tx.payment.findUnique({ where: { id: paymentId } });
      if (latest?.status === targetStatus) {
        return { success: true, idempotent: true, payment: latest };
      }
      throw new PaymentStateConflictError(
        latest?.status ?? "نامشخص",
        targetStatus,
        actor.correlationId ?? undefined
      );
    }

    // 4. Update parent waybill's payment_status
    await tx.waybill.update({
      where: { id: current.waybillId },
      data: { paymentStatus: targetStatus },
    });

    // 5. If review decision, record in payment_reviews
    if (["APPROVED", "REJECTED", "DISCREPANCY_REVIEW"].includes(targetStatus) && actor.actorId) {
      const reviewDecision =
        targetStatus === "APPROVED"
          ? "APPROVED"
          : targetStatus === "REJECTED"
          ? "REJECTED"
          : "DISCREPANCY";

      await tx.paymentReview.create({
        data: {
          organizationId,
          paymentId,
          reviewerId: actor.actorId,
          decision: reviewDecision,
          notes: notes ?? rejectionReason,
        },
      });
    }

    // 6. Record in immutable audit_logs
    await createAuditLogEntry(tx, {
      organizationId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: `PAYMENT_${targetStatus}`,
      entityType: "PAYMENT",
      entityId: paymentId,
      beforeJson: { status: current.status, version: expectedVersion },
      afterJson: {
        status: targetStatus,
        version: expectedVersion + 1,
        rejectionReason,
        notes,
      },
      correlationId: actor.correlationId,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return {
      success: true,
      idempotent: false,
      previousStatus: current.status,
      targetStatus,
      newVersion: expectedVersion + 1,
    };
  });
}

// =============================================================================
// 3. DRIVER PAYMENT SUBMISSION (WITH COMMITMENT GATE)
// =============================================================================

export interface SubmitPaymentInput {
  organizationId: string;
  waybillId: string;
  method: "CARD_TO_CARD" | "POS" | "CASH" | "BANK_TRANSFER" | "GATEWAY" | "OTHER";
  amount: bigint;
  trackingNumber?: string;
  payoutCardId?: string;
  receiptDocumentId?: string;
  idempotencyKey?: string;
  actor: StateActor;
  enforcementMode?: "OFF" | "SHADOW" | "ENFORCED";
}

export async function submitWaybillPayment(input: SubmitPaymentInput) {
  const {
    organizationId,
    waybillId,
    method,
    amount,
    trackingNumber,
    payoutCardId,
    receiptDocumentId,
    idempotencyKey,
    actor,
    enforcementMode = (process.env.COMMITMENT_ENFORCEMENT as "OFF" | "SHADOW" | "ENFORCED") || "OFF",
  } = input;

  return prisma.$transaction(async (tx) => {
    const waybill = await tx.waybill.findFirst({
      where: { id: waybillId, organizationId },
      include: {
        amounts: { where: { isCurrent: true }, take: 1 },
      },
    });

    if (!waybill) {
      throw new AppError("NOT_FOUND", "بارنامه مورد نظر یافت نشد.");
    }

    // Invariant: payment on CANCELLED or ARCHIVED waybill is rejected
    if (waybill.shipmentStatus === "CANCELLED" || waybill.shipmentStatus === "ARCHIVED") {
      throw new WaybillNotActiveError(waybill.shipmentStatus, actor.correlationId ?? undefined);
    }

    // Invariant I-14 / Decision 19: Commitment before payment in ENFORCED mode
    if (enforcementMode === "ENFORCED" && waybill.commitmentStatus !== "ACCEPTED") {
      throw new CommitmentNotAcceptedError(actor.correlationId ?? undefined);
    }

    const currentAmount = waybill.amounts[0];
    if (!currentAmount) {
      throw new AppError("INTERNAL_ERROR", "مبلغ فعال برای بارنامه یافت نشد.");
    }

    // Create payment row
    const payment = await tx.payment.create({
      data: {
        organizationId,
        waybillId,
        waybillAmountId: currentAmount.id,
        method,
        amount,
        trackingNumber,
        payoutCardId,
        receiptDocumentId,
        idempotencyKey,
        submittedByType: actor.actorType === "DRIVER" ? "DRIVER" : "OPERATOR",
        submittedById: actor.actorId,
        status: method === "GATEWAY" ? "APPROVED" : "SUBMITTED",
        autoVerifiedAt: method === "GATEWAY" ? new Date() : undefined,
      },
    });

    // Update waybill status
    await tx.waybill.update({
      where: { id: waybillId },
      data: {
        paymentStatus: method === "GATEWAY" ? "APPROVED" : "SUBMITTED",
      },
    });

    // Audit log
    await createAuditLogEntry(tx, {
      organizationId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "PAYMENT_SUBMITTED",
      entityType: "PAYMENT",
      entityId: payment.id,
      afterJson: {
        waybillId,
        amount: amount.toString(),
        method,
        trackingNumber,
        status: payment.status,
      },
      correlationId: actor.correlationId,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return payment;
  });
}

// =============================================================================
// 4. COMMITMENT STATUS TRANSITIONS
// =============================================================================

export interface AcceptCommitmentInput {
  organizationId: string;
  waybillId: string;
  commitmentVersionId: string;
  contentHash: string;
  renderedText: string;
  signatureDocumentId?: string;
  actor: StateActor;
}

export async function acceptDriverCommitment(input: AcceptCommitmentInput) {
  const {
    organizationId,
    waybillId,
    commitmentVersionId,
    contentHash,
    renderedText,
    signatureDocumentId,
    actor,
  } = input;

  return prisma.$transaction(async (tx) => {
    const waybill = await tx.waybill.findFirst({
      where: { id: waybillId, organizationId },
    });

    if (!waybill) {
      throw new AppError("NOT_FOUND", "بارنامه مورد نظر یافت نشد.");
    }

    if (waybill.shipmentStatus === "CANCELLED" || waybill.shipmentStatus === "ARCHIVED") {
      throw new WaybillNotActiveError(waybill.shipmentStatus, actor.correlationId ?? undefined);
    }

    // Insert or update acceptance
    const acceptance = await tx.commitmentAcceptance.upsert({
      where: {
        waybillId_commitmentVersionId: {
          waybillId,
          commitmentVersionId,
        },
      },
      create: {
        organizationId,
        waybillId,
        commitmentVersionId,
        contentHash,
        renderedText,
        signatureDocumentId,
        mobileVerified: true,
        ip: actor.ip,
        userAgent: actor.userAgent,
      },
      update: {
        contentHash,
        renderedText,
        signatureDocumentId,
        signedAt: new Date(),
        ip: actor.ip,
        userAgent: actor.userAgent,
      },
    });

    // Update waybill commitment_status to ACCEPTED
    await tx.waybill.update({
      where: { id: waybillId },
      data: { commitmentStatus: "ACCEPTED" },
    });

    // Audit log
    await createAuditLogEntry(tx, {
      organizationId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "COMMITMENT_ACCEPTED",
      entityType: "WAYBILL",
      entityId: waybillId,
      afterJson: {
        commitmentVersionId,
        contentHash,
        signatureDocumentId,
      },
      correlationId: actor.correlationId,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return acceptance;
  });
}

// =============================================================================
// 4. DOCUMENT STATUS TRANSITIONS
// =============================================================================

const ALLOWED_DOCUMENT_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  NOT_UPLOADED: ["UPLOADED", "MATCHED", "VERIFIED"],
  UPLOADED: ["MATCHED", "MISMATCHED", "PENDING_REVIEW", "CORRUPTED", "VERIFIED"],
  MATCHED: ["VERIFIED", "REPLACEMENT_PENDING", "PENDING_REVIEW", "NOT_UPLOADED"],
  MISMATCHED: ["MATCHED", "PENDING_REVIEW", "NOT_UPLOADED"],
  PENDING_REVIEW: ["MATCHED", "VERIFIED", "NOT_UPLOADED"],
  VERIFIED: ["REPLACEMENT_PENDING", "NOT_UPLOADED"],
  REPLACEMENT_PENDING: ["VERIFIED", "NOT_UPLOADED"],
  CORRUPTED: ["NOT_UPLOADED", "UPLOADED"],
};

export interface TransitionDocumentInput {
  organizationId: string;
  waybillId: string;
  targetStatus: DocumentStatus;
  expectedVersion: number;
  actor: StateActor;
  reason?: string;
}

export async function transitionWaybillDocumentStatus(
  input: TransitionDocumentInput,
  txClient?: Prisma.TransactionClient
) {
  const run = async (tx: Prisma.TransactionClient) => {
    const { organizationId, waybillId, targetStatus, expectedVersion, actor, reason } = input;

    const current = await tx.waybill.findFirst({
      where: { id: waybillId, organizationId },
    });

    if (!current) {
      throw new AppError("NOT_FOUND", "بارنامه مورد نظر یافت نشد.");
    }

    if (current.documentStatus === targetStatus) {
      return { success: true, idempotent: true, waybill: current };
    }

    const allowed = ALLOWED_DOCUMENT_TRANSITIONS[current.documentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw new AppError(
        "INVALID_TRANSITION",
        `امکان گذار وضعیت مدرک از «${current.documentStatus}» به «${targetStatus}» وجود ندارد.`
      );
    }

    const updatedCount = await tx.waybill.updateMany({
      where: {
        id: waybillId,
        organizationId,
        version: expectedVersion,
        documentStatus: current.documentStatus,
      },
      data: {
        documentStatus: targetStatus,
        version: { increment: 1 },
      },
    });

    if (updatedCount.count === 0) {
      const fresh = await tx.waybill.findUnique({ where: { id: waybillId } });
      throw new AppError(
        "CONFLICT",
        `وضعیت مدرک بارنامه هم‌زمان تغییر یافته است. وضعیت جاری: ${fresh?.documentStatus}`
      );
    }

    await createAuditLogEntry(tx, {
      organizationId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: `DOCUMENT_STATUS_${targetStatus}`,
      entityType: "WAYBILL",
      entityId: waybillId,
      beforeJson: { status: current.documentStatus, version: expectedVersion },
      afterJson: { status: targetStatus, version: expectedVersion + 1, reason },
      correlationId: actor.correlationId,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return {
      success: true,
      idempotent: false,
      previousStatus: current.documentStatus,
      targetStatus,
      newVersion: expectedVersion + 1,
    };
  };

  if (txClient) {
    return run(txClient);
  }
  return prisma.$transaction(run);
}

