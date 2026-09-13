/**
 * Unified PaymentProvider interface and adapter registry.
 * Follows payment-gateways.md and master-spec Appendix C.
 */

export type GatewayProviderCode =
  | "SEP"
  | "BPM"
  | "PASARGAD"
  | "SADAD"
  | "ZARINPAL"
  | "ZIBAL";

export interface InitiatePaymentInput {
  amountRial: bigint;
  waybillNumber: string;
  driverMobile: string;
  callbackUrl: string;
  state: string;
}

export interface InitiatePaymentResult {
  providerReference: string;
  redirect: {
    method: "GET" | "POST";
    url: string;
    formFields?: Record<string, string>;
  };
}

export interface VerifyTransactionInput {
  providerReference: string;
  amountRial: bigint;
  callbackPayload: Record<string, unknown>;
}

export interface VerifyTransactionResult {
  verified: boolean;
  paidAmountRial?: bigint;
  maskedPan?: string;
  traceNumber?: string;
  raw: Record<string, unknown>;
}

export interface InquiryTransactionInput {
  providerReference: string;
}

export interface InquiryTransactionResult {
  status: "VERIFIED" | "FAILED" | "UNKNOWN";
  paidAmountRial?: bigint;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly code: GatewayProviderCode;
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verifyTransaction(input: VerifyTransactionInput): Promise<VerifyTransactionResult>;
  inquiryTransaction(input: InquiryTransactionInput): Promise<InquiryTransactionResult>;
}

// Registry map for provider adapters
export const gatewayAdapters: Partial<Record<GatewayProviderCode, PaymentProvider>> = {};
