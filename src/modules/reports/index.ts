/**
 * Public interface for reports module.
 */
export interface DailyReportSummary {
  organizationId: string;
  reportDate: string;
  totalWaybills: number;
  totalPaidAmount: bigint;
  onlinePaymentsCount: number;
  manualPaymentsCount: number;
  pendingReviewsCount: number;
}

// Module export boundary
export * from "./reporting-service";
