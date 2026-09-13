/**
 * Public interface for auth module.
 */
export type UserRole =
  | "OWNER"
  | "MANAGER"
  | "SUPERVISOR"
  | "OPERATOR"
  | "TECH_ADMIN";

export type SystemPermission =
  | "MANAGE_USERS"
  | "DELEGATE_REVIEW"
  | "VERIFY_PAYMENT"
  | "CORRECT_AMOUNT_AFTER_PAYMENT"
  | "RECORD_REFUND"
  | "APPROVE_REFUND"
  | "ISSUE_RELEASE"
  | "REPLACE_PDF"
  | "CANCEL_WAYBILL"
  | "MANAGE_PAYMENT_GATEWAYS"
  | "MANAGE_BANK_CARDS";

export * from "./driver-auth";

