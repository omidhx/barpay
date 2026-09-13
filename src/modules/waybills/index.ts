/**
 * Public interface for waybills module.
 */
export * from "@/lib/waybills/phase";
export * from "@/lib/waybills/amount";

export interface WaybillSummary {
  id: string;
  organizationId: string;
  waybillNumber: string;
  waybillYear?: number | null;
  driverNameRaw: string;
  driverMobileRaw: string;
  issueDate: Date;
  amount: bigint;
  phase: string;
}

// Module export boundary
