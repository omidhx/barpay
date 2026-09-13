import { prisma } from "@/lib/db/client";
import { PaymentStatus, PaymentMethod } from "@prisma/client";
import { AppError, PaymentStateConflictError } from "@/lib/errors/exceptions";
import { createAuditLogEntry } from "@/lib/audit/audit-logger";

export interface ReviewQueueFilters {
  organizationId: string;
  status?: PaymentStatus;
  method?: PaymentMethod;
  limit?: number;
  offset?: number;
}

export interface ReviewQueueItem {
  id: string;
  waybillId: string;
  waybillNumber: string;
  waybillYear?: number | null;
  driverName?: string | null;
  driverMobile?: string | null;
  method: PaymentMethod;
  amount: bigint;
  trackingNumber?: string | null;
  payoutCard?: {
    bankCode: string;
    cardNumber: string;
    holderName: string;
  } | null;
  receiptDocument?: {
    id: string;
    storageKey: string;
    mimeType: string;
    fileSize: number;
  } | null;
  status: PaymentStatus;
  version: number;
  waitMinutes: number;
  isStale: boolean;
  waybillAmount: bigint;
  remainingAmount: bigint;
  submittedAt: Date;
}

export interface ReviewPaymentInput {
  organizationId: string;
  paymentId: string;
  decision: "APPROVED" | "REJECTED" | "DISCREPANCY";
  expectedVersion: number;
  reviewerId: string;
  notes?: string;
  rejectionReason?: string;
  actor: {
    actorType: "USER" | "SYSTEM";
    actorId: string;
    ip?: string | null;
    userAgent?: string | null;
    correlationId?: string | null;
  };
}

export interface ReviewPaymentResult {
  success: boolean;
  idempotent: boolean;
  paymentId: string;
  status: PaymentStatus;
  waybillStatus: PaymentStatus;
  releaseStatus?: string;
}

/**
 * Lists manual payments awaiting review or in discrepancy.
 * Flags items older than 4 hours as stale (SLA monitoring).
 */
export async function getReviewQueue(filters: ReviewQueueFilters): Promise<{
  items: ReviewQueueItem[];
  total: number;
  staleCount: number;
}> {
  const { organizationId, status, method, limit = 50, offset = 0 } = filters;

  const now = new Date();
  const staleThreshold = new Date(now.getTime() - 4 * 60 * 60 * 1000); // 4 hours ago

  const whereClause: {
    organizationId: string;
    status: PaymentStatus | { in: PaymentStatus[] };
    method?: PaymentMethod;
  } = {
    organizationId,
    status: status || { in: ["SUBMITTED", "UNDER_REVIEW"] },
    ...(method ? { method } : {}),
  };

  const [payments, total, staleCount] = await Promise.all([
    prisma.payment.findMany({
      where: whereClause,
      include: {
        waybill: {
          include: {
            driver: true,
            amounts: { where: { isCurrent: true }, take: 1 },
            payments: { where: { status: "APPROVED" } },
          },
        },
        payoutCard: true,
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      skip: offset,
    }),
    prisma.payment.count({ where: whereClause }),
    prisma.payment.count({
      where: {
        ...whereClause,
        createdAt: { lt: staleThreshold },
      },
    }),
  ]);

  // Fetch receipt documents if any
  const receiptDocIds = payments
    .map((p) => p.receiptDocumentId)
    .filter((id): id is string => Boolean(id));

  const receipts = receiptDocIds.length > 0
    ? await prisma.document.findMany({
        where: { id: { in: receiptDocIds } },
        select: { id: true, storageKey: true, mimeType: true, fileSize: true },
      })
    : [];

  const receiptMap = new Map(receipts.map((r) => [r.id, r]));

  const items: ReviewQueueItem[] = payments.map((payment) => {
    const waybill = payment.waybill;
    const currentAmount = waybill.amounts[0]?.amount ?? BigInt(0);
    const approvedSum = waybill.payments.reduce(
      (acc, p) => acc + p.amount,
      BigInt(0)
    );
    const remaining = currentAmount > approvedSum ? currentAmount - approvedSum : BigInt(0);

    const waitMinutes = Math.max(
      0,
      Math.floor((now.getTime() - payment.createdAt.getTime()) / (60 * 1000))
    );
    const isStale = payment.createdAt < staleThreshold;

    const receipt = payment.receiptDocumentId
      ? receiptMap.get(payment.receiptDocumentId) ?? null
      : null;

    return {
      id: payment.id,
      waybillId: waybill.id,
      waybillNumber: waybill.waybillNumber,
      waybillYear: waybill.waybillYear,
      driverName: waybill.driverNameRaw || waybill.driver?.fullName || null,
      driverMobile: waybill.driverMobileRaw || waybill.driver?.mobile || null,
      method: payment.method,
      amount: payment.amount,
      trackingNumber: payment.trackingNumber,
      payoutCard: payment.payoutCard
        ? {
            bankCode: payment.payoutCard.bankCode,
            cardNumber: payment.payoutCard.cardNumber,
            holderName: `${payment.payoutCard.holderFirstName} ${payment.payoutCard.holderLastName}`,
          }
        : null,
      receiptDocument: receipt,
      status: payment.status,
      version: payment.version,
      waitMinutes,
      isStale,
      waybillAmount: currentAmount,
      remainingAmount: remaining,
      submittedAt: payment.createdAt,
    };
  });

  return { items, total, staleCount };
}

/**
 * Processes a review decision on a manual payment.
 * Enforces:
 * 1. Concurrency control via optimistic lock (version + status IN ('SUBMITTED', 'UNDER_REVIEW')).
 * 2. Guard AMOUNT_CHANGED: ensures payment was created against the currently active amount.
 * 3. Guard OVERPAYMENT_REQUIRES_DISCREPANCY: if amount > remaining balance, normal approval is blocked.
 * 4. Mandatory rejectionReason for REJECTED decisions.
 * 5. Automatic release eligibility evaluation when APPROVED.
 * 6. Audit logging with row hash.
 */
export async function reviewPayment(input: ReviewPaymentInput): Promise<ReviewPaymentResult> {
  const {
    organizationId,
    paymentId,
    decision,
    expectedVersion,
    reviewerId,
    notes,
    rejectionReason,
    actor,
  } = input;

  if (decision === "REJECTED" && (!rejectionReason || rejectionReason.trim().length === 0)) {
    throw new AppError("REJECTION_REASON_REQUIRED", "درج دلیل برای رد پرداخت الزامی است.");
  }

  const targetStatus: PaymentStatus =
    decision === "APPROVED"
      ? "APPROVED"
      : decision === "REJECTED"
      ? "REJECTED"
      : "DISCREPANCY_REVIEW";

  return prisma.$transaction(async (tx) => {
    // 1. Fetch payment with parent waybill and current amount
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, organizationId },
      include: {
        waybill: {
          include: {
            amounts: { where: { isCurrent: true }, take: 1 },
            payments: { where: { status: "APPROVED" } },
          },
        },
      },
    });

    if (!payment) {
      throw new AppError("NOT_FOUND", "رکورد پرداخت مورد نظر یافت نشد.");
    }

    // Idempotent return if already reviewed with same decision by same reviewer
    if (payment.status === targetStatus && payment.reviewedBy === reviewerId) {
      return {
        success: true,
        idempotent: true,
        paymentId,
        status: payment.status,
        waybillStatus: payment.waybill.paymentStatus,
      };
    }

    // Must be in reviewable status
    if (!["SUBMITTED", "UNDER_REVIEW", "DISCREPANCY_REVIEW"].includes(payment.status)) {
      throw new PaymentStateConflictError(payment.status, targetStatus, actor.correlationId ?? undefined);
    }

    const waybill = payment.waybill;
    const currentAmountRecord = waybill.amounts[0];

    // If approving, enforce financial safety guards
    if (decision === "APPROVED") {
      // Guard 1: AMOUNT_CHANGED
      // If current_amount_id has changed since payment was submitted, block normal approval
      if (currentAmountRecord && payment.waybillAmountId !== currentAmountRecord.id) {
        throw new AppError(
          "AMOUNT_CHANGED",
          "مبلغ بارنامه پس از ثبت این پرداخت تغییر یافته است. لطفاً مغایرت را بررسی فرمایید.",
          actor.correlationId ?? undefined
        );
      }

      // Guard 2: OVERPAYMENT_REQUIRES_DISCREPANCY
      // Sum of other approved payments
      const otherApprovedSum = waybill.payments
        .filter((p) => p.id !== paymentId)
        .reduce((sum, p) => sum + p.amount, BigInt(0));

      const targetPayableAmount = currentAmountRecord?.amount ?? BigInt(0);
      const remainingBalance = targetPayableAmount > otherApprovedSum
        ? targetPayableAmount - otherApprovedSum
        : BigInt(0);

      if (payment.amount > remainingBalance) {
        throw new AppError(
          "OVERPAYMENT_REQUIRES_DISCREPANCY",
          `مبلغ واریزی (${payment.amount.toString()} ریال) بیش از مانده بدهی بارنامه (${remainingBalance.toString()} ریال) است و باید در صف مغایرت ثبت شود.`,
          actor.correlationId ?? undefined
        );
      }
    }

    // 2. Perform conditional update with optimistic version lock
    const updateResult = await tx.payment.updateMany({
      where: {
        id: paymentId,
        organizationId,
        version: expectedVersion,
        status: payment.status,
      },
      data: {
        status: targetStatus,
        version: { increment: 1 },
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        rejectionReason: decision === "REJECTED" ? rejectionReason : null,
      },
    });

    // 3. Race condition detection (Another reviewer won the race)
    if (updateResult.count === 0) {
      const fresh = await tx.payment.findUnique({ where: { id: paymentId } });
      if (fresh?.status === targetStatus && fresh.reviewedBy === reviewerId) {
        return {
          success: true,
          idempotent: true,
          paymentId,
          status: fresh.status,
          waybillStatus: waybill.paymentStatus,
        };
      }
      throw new PaymentStateConflictError(
        fresh?.status ?? "نامشخص",
        targetStatus,
        actor.correlationId ?? undefined
      );
    }

    // 4. Create review record in payment_reviews
    const reviewDecision =
      decision === "APPROVED"
        ? "APPROVED"
        : decision === "REJECTED"
        ? "REJECTED"
        : "DISCREPANCY";

    await tx.paymentReview.create({
      data: {
        organizationId,
        paymentId,
        reviewerId,
        decision: reviewDecision,
        notes: notes ?? rejectionReason ?? null,
      },
    });

    // 5. Update waybill status and check release eligibility
    let newWaybillPaymentStatus: PaymentStatus;
    let newReleaseStatus = waybill.releaseStatus;

    if (decision === "APPROVED") {
      const allApprovedSum = waybill.payments
        .filter((p) => p.id !== paymentId)
        .reduce((sum, p) => sum + p.amount, BigInt(0)) + payment.amount;

      const totalTarget = currentAmountRecord?.amount ?? BigInt(0);

      if (allApprovedSum >= totalTarget) {
        newWaybillPaymentStatus = "APPROVED";

        // Check if waybill is now eligible for release (PDF verified & commitment accepted)
        const isDocVerified = waybill.documentStatus === "VERIFIED";
        const isCommitmentAccepted = ["ACCEPTED", "NOT_REQUIRED"].includes(waybill.commitmentStatus);

        if (isDocVerified && isCommitmentAccepted && waybill.releaseStatus === "BLOCKED") {
          newReleaseStatus = "ELIGIBLE";
        }
      } else {
        newWaybillPaymentStatus = "RESIDUAL_DUE";
      }
    } else if (decision === "REJECTED") {
      newWaybillPaymentStatus = "REJECTED";
    } else {
      newWaybillPaymentStatus = "DISCREPANCY_REVIEW";
    }

    await tx.waybill.update({
      where: { id: waybill.id },
      data: {
        paymentStatus: newWaybillPaymentStatus,
        releaseStatus: newReleaseStatus,
      },
    });

    // 6. Record in immutable audit_logs
    await createAuditLogEntry(tx, {
      organizationId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: `PAYMENT_${targetStatus}`,
      entityType: "PAYMENT",
      entityId: paymentId,
      beforeJson: { status: payment.status, version: expectedVersion },
      afterJson: {
        status: targetStatus,
        version: expectedVersion + 1,
        rejectionReason,
        notes,
        waybillPaymentStatus: newWaybillPaymentStatus,
        releaseStatus: newReleaseStatus,
      },
      correlationId: actor.correlationId,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return {
      success: true,
      idempotent: false,
      paymentId,
      status: targetStatus,
      waybillStatus: newWaybillPaymentStatus,
      releaseStatus: newReleaseStatus,
    };
  });
}
