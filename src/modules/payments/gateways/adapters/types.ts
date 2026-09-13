/**
 * Types and interfaces for payment gateway adapters.
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
  credentials: Record<string, unknown>;
  sandbox?: boolean;
}

export interface InitiatePaymentResult {
  providerReference: string;
  redirect: {
    method: "GET" | "POST";
    url: string;
    formFields?: Record<string, string>;
  };
  raw?: Record<string, unknown>;
}

export interface VerifyTransactionInput {
  providerReference: string;
  amountRial: bigint;
  callbackPayload?: Record<string, unknown>;
  credentials: Record<string, unknown>;
  sandbox?: boolean;
}

export interface VerifyTransactionResult {
  verified: boolean;
  paidAmountRial?: bigint;
  maskedPan?: string;
  traceNumber?: string;
  referenceNumber?: string;
  raw: Record<string, unknown>;
}

export interface InquiryTransactionInput {
  providerReference: string;
  credentials: Record<string, unknown>;
  sandbox?: boolean;
}

export interface InquiryTransactionResult {
  status: "VERIFIED" | "FAILED" | "UNKNOWN";
  paidAmountRial?: bigint;
  traceNumber?: string;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly code: GatewayProviderCode;
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verifyTransaction(input: VerifyTransactionInput): Promise<VerifyTransactionResult>;
  inquiryTransaction(input: InquiryTransactionInput): Promise<InquiryTransactionResult>;
}
