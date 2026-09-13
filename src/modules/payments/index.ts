/**
 * Public interface for payments module.
 */
export * from "./gateways/adapters";

export type PaymentMethod =
  | "CARD_TO_CARD"
  | "POS"
  | "CASH"
  | "BANK_TRANSFER"
  | "GATEWAY"
  | "OTHER";

export interface CreatePaymentInput {
  organizationId: string;
  waybillId: string;
  method: PaymentMethod;
  amount: bigint;
  trackingNumber?: string;
  payoutCardId?: string;
  receiptDocumentId?: string;
  idempotencyKey?: string;
}

// Module export boundary
