/**
 * Single derived-phase function for barnameh-pay.
 * Follows state-transitions.md §3 and master-spec §5.
 * 
 * Phases are purely derived from the 5 independent status axes.
 * Never stored as a column in the database.
 */

export type ShipmentStatus =
  | "DRAFT"
  | "IMPORTED"
  | "VALIDATION_FAILED"
  | "READY_FOR_DRIVER"
  | "DRIVER_NOTIFIED"
  | "DRIVER_VIEWED"
  | "COMPLETED"
  | "CANCELLED"
  | "ARCHIVED";

export type DocumentStatus =
  | "NOT_UPLOADED"
  | "UPLOADED"
  | "MATCHED"
  | "MISMATCHED"
  | "PENDING_REVIEW"
  | "VERIFIED"
  | "REPLACEMENT_PENDING"
  | "CORRUPTED";

export type PaymentStatus =
  | "NOT_REQUIRED"
  | "NOT_SUBMITTED"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "DISCREPANCY_REVIEW"
  | "RESIDUAL_DUE"
  | "REFUND_RECORDED"
  | "REFUND_SETTLED"
  | "CANCELLED";

export type CommitmentStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "ACCEPTED"
  | "DECLINED"
  | "RE_ACCEPT_REQUIRED";

export type ReleaseStatus =
  | "BLOCKED"
  | "ELIGIBLE"
  | "AUTHORIZED"
  | "RELEASED"
  | "REVOKED";

export type WaybillPhase =
  | "IMPORTED"
  | "PDF_ATTACHED"
  | "AWAITING_COMMITMENT"
  | "AWAITING_PAYMENT"
  | "PAYMENT_UNDER_REVIEW"
  | "PAYMENT_REJECTED"
  | "RESIDUAL_PAYMENT"
  | "REFUND_RECORDED"
  | "REFUND_SETTLED"
  | "READY_FOR_RELEASE"
  | "RELEASED"
  | "COMPLETED"
  | "CANCELLED"
  | "ARCHIVED"
  | "NEEDS_ATTENTION";

export interface WaybillStatusAxes {
  shipmentStatus: ShipmentStatus;
  documentStatus: DocumentStatus;
  paymentStatus: PaymentStatus;
  commitmentStatus: CommitmentStatus;
  releaseStatus: ReleaseStatus;
}

/**
 * Derives the single display phase from the 5 status axes.
 * Priority follows state-transitions.md.
 */
export function deriveWaybillPhase(axes: WaybillStatusAxes): WaybillPhase {
  const {
    shipmentStatus,
    documentStatus,
    paymentStatus,
    commitmentStatus,
    releaseStatus,
  } = axes;

  // Terminal shipment statuses take top precedence
  if (shipmentStatus === "CANCELLED") return "CANCELLED";
  if (shipmentStatus === "ARCHIVED") return "ARCHIVED";
  if (shipmentStatus === "COMPLETED") return "COMPLETED";

  // Terminal release status
  if (releaseStatus === "RELEASED") return "RELEASED";

  // Ready for release
  if (commitmentStatus === "ACCEPTED" && releaseStatus === "ELIGIBLE") {
    return "READY_FOR_RELEASE";
  }

  // Refunds
  if (paymentStatus === "REFUND_SETTLED") return "REFUND_SETTLED";
  if (paymentStatus === "REFUND_RECORDED") return "REFUND_RECORDED";

  // Residual payment
  if (paymentStatus === "RESIDUAL_DUE") return "RESIDUAL_PAYMENT";

  // Payment reviews
  if (paymentStatus === "REJECTED") return "PAYMENT_REJECTED";
  if (paymentStatus === "SUBMITTED" || paymentStatus === "UNDER_REVIEW") {
    return "PAYMENT_UNDER_REVIEW";
  }

  // Driver interactions (pre-payment & commitment)
  if (
    (shipmentStatus === "DRIVER_NOTIFIED" || shipmentStatus === "DRIVER_VIEWED") &&
    paymentStatus === "NOT_SUBMITTED"
  ) {
    if (commitmentStatus === "PENDING" || commitmentStatus === "DECLINED") {
      return "AWAITING_COMMITMENT";
    }
    if (commitmentStatus === "ACCEPTED" || commitmentStatus === "NOT_REQUIRED") {
      return "AWAITING_PAYMENT";
    }
  }

  // Document matching
  if (documentStatus === "VERIFIED" && shipmentStatus === "READY_FOR_DRIVER") {
    return "PDF_ATTACHED";
  }

  // Initial import
  if (
    (shipmentStatus === "IMPORTED" || shipmentStatus === "VALIDATION_FAILED") &&
    documentStatus === "NOT_UPLOADED"
  ) {
    return "IMPORTED";
  }

  // Explicit fallback: never guess
  return "NEEDS_ATTENTION";
}

/**
 * Persian human-readable title for each phase
 */
export const WAYBILL_PHASE_LABELS: Record<WaybillPhase, string> = {
  IMPORTED: "وارد شده از اکسل",
  PDF_ATTACHED: "سند PDF متصل شد",
  AWAITING_COMMITMENT: "در انتظار پذیرش تعهدنامه",
  AWAITING_PAYMENT: "در انتظار پرداخت",
  PAYMENT_UNDER_REVIEW: "پرداخت در حال بررسی",
  PAYMENT_REJECTED: "پرداخت رد شده",
  RESIDUAL_PAYMENT: "در انتظار پرداخت مابقی",
  REFUND_RECORDED: "بازگشت وجه ثبت شد",
  REFUND_SETTLED: "بازگشت وجه تسویه شد",
  READY_FOR_RELEASE: "آماده آزادسازی",
  RELEASED: "تحویل داده شده",
  COMPLETED: "تکمیل شده",
  CANCELLED: "باطل شده",
  ARCHIVED: "بایگانی شده",
  NEEDS_ATTENTION: "نیازمند بررسی متصدی",
};
