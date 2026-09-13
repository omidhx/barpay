import { prisma } from "@/lib/db/client";
import {
  deriveWaybillPhase,
  WaybillPhase,
  WaybillStatusAxes,
} from "@/lib/waybills/phase";
import {
  GatewayProvider,
  PaymentMethod,
  PaymentStatus,
  RefundStatus,
  Prisma,
} from "@prisma/client";

/**
 * Formula Injection Protection for CSV/Excel exports (master-spec §11.2, §2.2).
 * Any cell value starting with '=', '+', '-', '@' must be prepended with a single quote (').
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let str = typeof value === "bigint" ? value.toString() : String(value);

  // Strip carriage returns to prevent breaking rows
  str = str.replace(/\r\n/g, " ").replace(/\n/g, " ");

  // Prevent formula injection in spreadsheet software
  if (/^[=+\-@]/.test(str)) {
    str = "'" + str;
  }

  // Quote if contains comma, quote, or newline
  if (str.includes(",") || str.includes('"')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Generates a UTF-8 CSV string with BOM (\uFEFF) for native Persian Excel display.
 */
export function generateSafeCsv(headers: string[], rows: (unknown[])[]): string {
  const BOM = "\uFEFF";
  const headerLine = headers.map(sanitizeCsvCell).join(",");
  const dataLines = rows.map((row) => row.map(sanitizeCsvCell).join(",")).join("\r\n");
  return `${BOM}${headerLine}\r\n${dataLines}`;
}

export interface DashboardSummary {
  phases: Record<WaybillPhase, number>;
  kpis: {
    totalWaybills: number;
    totalPaidAmount: bigint;
    todayPaidAmount: bigint;
    todayImportedCount: number;
    pendingReviewsCount: number;
    staleReviewsCount: number; // submitted > 4 hours ago
    pendingRefundsCount: number;
    unmatchedPdfsCount: number;
    failedSmsTodayCount: number;
    releasedCount: number;
    needsAttentionCount: number;
  };
}

/**
 * Retrieves the live operational dashboard summary.
 * Phases are calculated dynamically from the 5 status axes using deriveWaybillPhase.
 */
export async function getDashboardSummary(organizationId: string): Promise<DashboardSummary> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

  // 1. Fetch all waybill status axes for phase calculation
  const waybills = await prisma.waybill.findMany({
    where: { organizationId },
    select: {
      shipmentStatus: true,
      documentStatus: true,
      paymentStatus: true,
      commitmentStatus: true,
      releaseStatus: true,
    },
  });

  const phases: Record<WaybillPhase, number> = {
    IMPORTED: 0,
    PDF_ATTACHED: 0,
    AWAITING_COMMITMENT: 0,
    AWAITING_PAYMENT: 0,
    PAYMENT_UNDER_REVIEW: 0,
    PAYMENT_REJECTED: 0,
    RESIDUAL_PAYMENT: 0,
    REFUND_RECORDED: 0,
    REFUND_SETTLED: 0,
    READY_FOR_RELEASE: 0,
    RELEASED: 0,
    COMPLETED: 0,
    CANCELLED: 0,
    ARCHIVED: 0,
    NEEDS_ATTENTION: 0,
  };

  for (const wb of waybills) {
    const phase = deriveWaybillPhase(wb as WaybillStatusAxes);
    phases[phase] = (phases[phase] || 0) + 1;
  }

  // 2. Fetch financial & operational metrics
  const [
    totalWaybills,
    todayImportedCount,
    pendingReviewsCount,
    staleReviewsCount,
    pendingRefundsCount,
    unmatchedPdfsCount,
    failedSmsTodayCount,
    totalPaidAgg,
    todayPaidAgg,
  ] = await Promise.all([
    prisma.waybill.count({ where: { organizationId } }),
    prisma.waybill.count({
      where: { organizationId, createdAt: { gte: startOfDay } },
    }),
    prisma.payment.count({
      where: {
        organizationId,
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
      },
    }),
    prisma.payment.count({
      where: {
        organizationId,
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
        createdAt: { lte: fourHoursAgo },
      },
    }),
    prisma.paymentRefund.count({
      where: {
        organizationId,
        status: "RECORDED",
      },
    }),
    prisma.document.count({
      where: {
        organizationId,
        matchingStatus: "UNMATCHED",
      },
    }),
    prisma.notificationJob.count({
      where: {
        organizationId,
        createdAt: { gte: startOfDay },
        status: "FAILED",
      },
    }),
    prisma.payment.aggregate({
      where: { organizationId, status: "APPROVED" },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: {
        organizationId,
        status: "APPROVED",
        reviewedAt: { gte: startOfDay },
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    phases,
    kpis: {
      totalWaybills,
      totalPaidAmount: totalPaidAgg._sum.amount ?? BigInt(0),
      todayPaidAmount: todayPaidAgg._sum.amount ?? BigInt(0),
      todayImportedCount,
      pendingReviewsCount,
      staleReviewsCount,
      pendingRefundsCount,
      unmatchedPdfsCount,
      failedSmsTodayCount,
      releasedCount: phases.RELEASED,
      needsAttentionCount: phases.NEEDS_ATTENTION,
    },
  };
}

export interface ApprovedPaymentsReportOptions {
  organizationId: string;
  fromDate?: Date;
  toDate?: Date;
  method?: PaymentMethod;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Report of all approved payments with driver, waybill, bank, and reviewer details.
 */
export async function getApprovedPaymentsReport(options: ApprovedPaymentsReportOptions) {
  const {
    organizationId,
    fromDate,
    toDate,
    method,
    search,
    limit = 50,
    offset = 0,
  } = options;

  const where: Prisma.PaymentWhereInput = {
    organizationId,
    status: "APPROVED",
    ...(fromDate || toDate
      ? {
          reviewedAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(method ? { method } : {}),
    ...(search
      ? {
          OR: [
            { trackingNumber: { contains: search } },
            { waybill: { waybillNumber: { contains: search } } },
            { waybill: { driverNameRaw: { contains: search } } },
            { waybill: { driverMobileRaw: { contains: search } } },
          ],
        }
      : {}),
  };

  const [items, totalCount, totalAgg] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        waybill: {
          select: {
            waybillNumber: true,
            driverNameRaw: true,
            driverMobileRaw: true,
          },
        },
        payoutCard: {
          select: {
            bankCode: true,
            cardNumber: true,
          },
        },
        reviews: {
          take: 1,
          orderBy: { reviewedAt: "desc" },
          select: {
            reviewerId: true,
            notes: true,
            reviewedAt: true,
          },
        },
      },
      orderBy: { reviewedAt: "desc" },
      take: Math.min(limit, 500),
      skip: offset,
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({
      where,
      _sum: { amount: true },
    }),
  ]);

  return {
    items: items.map((p) => ({
      id: p.id,
      waybillId: p.waybillId,
      waybillNumber: p.waybill.waybillNumber,
      driverName: p.waybill.driverNameRaw,
      driverMobile: p.waybill.driverMobileRaw,
      amount: p.amount,
      method: p.method,
      trackingNumber: p.trackingNumber,
      referenceNumber: p.gatewayTransactionId ?? p.trackingNumber ?? null,
      bankName: p.payoutCard?.bankCode ?? null,
      payerCardMasked: p.payoutCard?.cardNumber ?? null,
      reviewedAt: p.reviewedAt,
      reviewerId: p.reviews[0]?.reviewerId ?? p.reviewedBy ?? null,
      reviewNotes: p.reviews[0]?.notes ?? null,
    })),
    totalCount,
    totalAmount: totalAgg._sum.amount ?? BigInt(0),
  };
}

export interface RoundingExcessReportOptions {
  organizationId: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Cumulative Rounding Excess Report (master-spec §11.2, §2.1).
 * Calculates sum of (roundedAmount - rawExcelAmount) to maintain financial transparency.
 */
export async function getRoundingExcessReport(options: RoundingExcessReportOptions) {
  const { organizationId, fromDate, toDate, limit = 50, offset = 0 } = options;

  const where: Prisma.WaybillAmountWhereInput = {
    organizationId,
    isCurrent: true,
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const [items, totalCount, allAmounts] = await Promise.all([
    prisma.waybillAmount.findMany({
      where,
      include: {
        waybill: {
          select: {
            waybillNumber: true,
            driverNameRaw: true,
            paymentStatus: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 500),
      skip: offset,
    }),
    prisma.waybillAmount.count({ where }),
    prisma.waybillAmount.findMany({
      where,
      select: {
        rawExcelAmount: true,
        roundedAmount: true,
        surchargeAmount: true,
        amount: true,
      },
    }),
  ]);

  let totalRawAmount = BigInt(0);
  let totalRoundedAmount = BigInt(0);
  let totalRoundingExcess = BigInt(0);
  let totalSurcharge = BigInt(0);
  let totalPayable = BigInt(0);
  let roundedUpCount = 0;
  let exactCount = 0;

  for (const a of allAmounts) {
    totalRawAmount += a.rawExcelAmount;
    totalRoundedAmount += a.roundedAmount;
    const diff = a.roundedAmount - a.rawExcelAmount;
    totalRoundingExcess += diff;
    totalSurcharge += a.surchargeAmount;
    totalPayable += a.amount;

    if (diff > BigInt(0)) {
      roundedUpCount++;
    } else {
      exactCount++;
    }
  }

  return {
    summary: {
      totalCount,
      totalRawAmount,
      totalRoundedAmount,
      totalRoundingExcess,
      totalSurcharge,
      totalPayable,
      roundedUpCount,
      exactCount,
    },
    items: items.map((item) => ({
      id: item.id,
      waybillId: item.waybillId,
      waybillNumber: item.waybill.waybillNumber,
      driverName: item.waybill.driverNameRaw,
      paymentStatus: item.waybill.paymentStatus,
      rawExcelAmount: item.rawExcelAmount,
      roundedAmount: item.roundedAmount,
      roundingExcess: item.roundedAmount - item.rawExcelAmount,
      surchargeAmount: item.surchargeAmount,
      payableAmount: item.amount,
      createdAt: item.createdAt,
    })),
  };
}

export interface DiscrepanciesReportOptions {
  organizationId: string;
  fromDate?: Date;
  toDate?: Date;
  status?: PaymentStatus;
  limit?: number;
  offset?: number;
}

/**
 * Report of waybills with amount corrections or discrepancy payment statuses.
 */
export async function getDiscrepanciesReport(options: DiscrepanciesReportOptions) {
  const { organizationId, fromDate, toDate, status, limit = 50, offset = 0 } = options;

  const where: Prisma.WaybillWhereInput = {
    organizationId,
    ...(status
      ? { paymentStatus: status }
      : {
          paymentStatus: {
            in: ["DISCREPANCY_REVIEW", "RESIDUAL_DUE", "REJECTED"],
          },
        }),
    ...(fromDate || toDate
      ? {
          updatedAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const [waybills, totalCount] = await Promise.all([
    prisma.waybill.findMany({
      where,
      include: {
        amounts: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: Math.min(limit, 500),
      skip: offset,
    }),
    prisma.waybill.count({ where }),
  ]);

  const items = waybills.map((wb) => {
    const currentAmount = wb.amounts.find((a) => a.isCurrent) ?? wb.amounts[0];
    const initialAmount = wb.amounts[wb.amounts.length - 1];

    const approvedTotal = wb.payments
      .filter((p) => p.status === "APPROVED")
      .reduce((sum, p) => sum + p.amount, BigInt(0));

    const residualDue =
      currentAmount && currentAmount.amount > approvedTotal
        ? currentAmount.amount - approvedTotal
        : BigInt(0);

    return {
      waybillId: wb.id,
      waybillNumber: wb.waybillNumber,
      driverName: wb.driverNameRaw,
      driverMobile: wb.driverMobileRaw,
      paymentStatus: wb.paymentStatus,
      initialPayableAmount: initialAmount?.amount ?? BigInt(0),
      currentPayableAmount: currentAmount?.amount ?? BigInt(0),
      totalApprovedPaid: approvedTotal,
      residualDue,
      amountsCount: wb.amounts.length,
      updatedAt: wb.updatedAt,
    };
  });

  return { items, totalCount };
}

export interface RefundsReportOptions {
  organizationId: string;
  status?: RefundStatus;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Report of all refund records with status, amounts, and approvals.
 */
export async function getRefundsReport(options: RefundsReportOptions) {
  const { organizationId, status, fromDate, toDate, limit = 50, offset = 0 } = options;

  const where: Prisma.PaymentRefundWhereInput = {
    organizationId,
    ...(status ? { status } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const [items, totalCount, agg] = await Promise.all([
    prisma.paymentRefund.findMany({
      where,
      include: {
        payment: {
          select: {
            trackingNumber: true,
            gatewayTransactionId: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 500),
      skip: offset,
    }),
    prisma.paymentRefund.count({ where }),
    prisma.paymentRefund.aggregate({
      where,
      _sum: { amount: true },
    }),
  ]);

  return {
    items,
    totalCount,
    totalAmount: agg._sum.amount ?? BigInt(0),
  };
}

export interface GatewayTransactionsReportOptions {
  organizationId: string;
  provider?: GatewayProvider;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Gateway Transactions Report by provider with success rate and financial volume (master-spec §11.2).
 */
export async function getGatewayTransactionsReport(
  options: GatewayTransactionsReportOptions
) {
  const { organizationId, provider, fromDate, toDate, limit = 50, offset = 0 } = options;

  const where: Prisma.GatewayTransactionWhereInput = {
    organizationId,
    ...(provider ? { provider } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const [transactions, totalCount, allTransactions] = await Promise.all([
    prisma.gatewayTransaction.findMany({
      where,
      include: {
        waybill: {
          select: {
            waybillNumber: true,
            driverNameRaw: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 500),
      skip: offset,
    }),
    prisma.gatewayTransaction.count({ where }),
    prisma.gatewayTransaction.findMany({
      where,
      select: {
        provider: true,
        status: true,
        amount: true,
      },
    }),
  ]);

  // Group by Provider stats
  const providerStats: Record<
    string,
    {
      provider: string;
      totalAttempts: number;
      verifiedCount: number;
      failedCount: number;
      unknownCount: number;
      expiredCount: number;
      totalVerifiedAmount: bigint;
      successRate: number;
    }
  > = {};

  for (const t of allTransactions) {
    if (!providerStats[t.provider]) {
      providerStats[t.provider] = {
        provider: t.provider,
        totalAttempts: 0,
        verifiedCount: 0,
        failedCount: 0,
        unknownCount: 0,
        expiredCount: 0,
        totalVerifiedAmount: BigInt(0),
        successRate: 0,
      };
    }
    const stat = providerStats[t.provider];
    stat.totalAttempts++;
    if (t.status === "VERIFIED") {
      stat.verifiedCount++;
      stat.totalVerifiedAmount += t.amount;
    } else if (t.status === "FAILED") {
      stat.failedCount++;
    } else if (t.status === "UNKNOWN") {
      stat.unknownCount++;
    } else if (t.status === "EXPIRED") {
      stat.expiredCount++;
    }
  }

  for (const stat of Object.values(providerStats)) {
    stat.successRate =
      stat.totalAttempts > 0
        ? Math.round((stat.verifiedCount / stat.totalAttempts) * 100)
        : 0;
  }

  return {
    providersSummary: Object.values(providerStats),
    totalCount,
    items: transactions.map((t) => ({
      id: t.id,
      waybillId: t.waybillId,
      waybillNumber: t.waybill.waybillNumber,
      driverName: t.waybill.driverNameRaw,
      provider: t.provider,
      providerReference: t.providerReference,
      amount: t.amount,
      status: t.status,
      errorCode: t.errorCode,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  };
}

export interface OperatorPerformanceReportOptions {
  organizationId: string;
  fromDate?: Date;
  toDate?: Date;
}

/**
 * Operator throughput and review SLA turnaround time report.
 */
export async function getOperatorPerformanceReport(
  options: OperatorPerformanceReportOptions
) {
  const { organizationId, fromDate, toDate } = options;

  const where: Prisma.PaymentReviewWhereInput = {
    organizationId,
    ...(fromDate || toDate
      ? {
          reviewedAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const reviews = await prisma.paymentReview.findMany({
    where,
    include: {
      payment: {
        select: {
          createdAt: true,
        },
      },
    },
  });

  const reviewerStats: Record<
    string,
    {
      reviewerId: string;
      totalReviews: number;
      approvedCount: number;
      rejectedCount: number;
      discrepancyCount: number;
      totalTurnaroundMs: number;
      avgTurnaroundMinutes: number;
    }
  > = {};

  for (const r of reviews) {
    if (!reviewerStats[r.reviewerId]) {
      reviewerStats[r.reviewerId] = {
        reviewerId: r.reviewerId,
        totalReviews: 0,
        approvedCount: 0,
        rejectedCount: 0,
        discrepancyCount: 0,
        totalTurnaroundMs: 0,
        avgTurnaroundMinutes: 0,
      };
    }

    const stat = reviewerStats[r.reviewerId];
    stat.totalReviews++;
    if (r.decision === "APPROVED") stat.approvedCount++;
    else if (r.decision === "REJECTED") stat.rejectedCount++;
    else if (r.decision === "DISCREPANCY") stat.discrepancyCount++;

    const turnaround = Math.max(0, r.reviewedAt.getTime() - r.payment.createdAt.getTime());
    stat.totalTurnaroundMs += turnaround;
  }

  for (const stat of Object.values(reviewerStats)) {
    stat.avgTurnaroundMinutes =
      stat.totalReviews > 0
        ? Math.round(stat.totalTurnaroundMs / stat.totalReviews / 60000)
        : 0;
  }

  return Object.values(reviewerStats);
}
