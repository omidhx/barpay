import {
  PaymentProvider,
  InitiatePaymentInput,
  InitiatePaymentResult,
  VerifyTransactionInput,
  VerifyTransactionResult,
  InquiryTransactionInput,
  InquiryTransactionResult,
} from "./types";
import { registerGatewayAdapter } from "./registry";

export class ZibalAdapter implements PaymentProvider {
  readonly code = "ZIBAL" as const;

  private getBaseUrl(): string {
    return "https://gateway.zibal.ir/v1";
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const { amountRial, waybillNumber, driverMobile, callbackUrl, state, credentials, sandbox } =
      input;
    const merchant = sandbox ? "zibal" : String(credentials.merchant || "zibal");

    const response = await fetch(`${this.getBaseUrl()}/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant,
        amount: Number(amountRial), // In Rials
        callbackUrl,
        description: `پرداخت بارنامه ${waybillNumber}`,
        orderId: state,
        mobile: driverMobile,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const json = (await response.json()) as {
      result: number;
      trackId?: number | string;
      message: string;
    };

    if (!response.ok || json.result !== 100 || !json.trackId) {
      throw new Error(`ZIBAL_INIT_FAILED: Result ${json.result} - ${json.message}`);
    }

    const trackId = json.trackId.toString();
    return {
      providerReference: trackId,
      redirect: {
        method: "GET",
        url: `https://gateway.zibal.ir/start/${trackId}`,
      },
      raw: json as Record<string, unknown>,
    };
  }

  async verifyTransaction(input: VerifyTransactionInput): Promise<VerifyTransactionResult> {
    const { providerReference, amountRial, credentials, sandbox } = input;
    const merchant = sandbox ? "zibal" : String(credentials.merchant || "zibal");

    const response = await fetch(`${this.getBaseUrl()}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant,
        trackId: providerReference,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const json = (await response.json()) as {
      result: number;
      amount?: number;
      refNumber?: number | string;
      cardNumber?: string;
      message: string;
    };

    // Result 100 = verified, 101 = already verified (idempotent)
    const verified = json.result === 100 || json.result === 101;
    let paidAmountRial: bigint | undefined;
    if (verified) {
      paidAmountRial = json.amount !== undefined ? BigInt(json.amount) : amountRial;
    }

    return {
      verified,
      paidAmountRial,
      maskedPan: json.cardNumber,
      traceNumber: json.refNumber?.toString(),
      referenceNumber: json.refNumber?.toString(),
      raw: json as Record<string, unknown>,
    };
  }

  async inquiryTransaction(input: InquiryTransactionInput): Promise<InquiryTransactionResult> {
    const { providerReference, credentials, sandbox } = input;
    const merchant = sandbox ? "zibal" : String(credentials.merchant || "zibal");

    try {
      const response = await fetch(`${this.getBaseUrl()}/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant,
          trackId: providerReference,
        }),
        signal: AbortSignal.timeout(10000),
      });

      const json = (await response.json()) as {
        result: number;
        status?: number;
        amount?: number;
        refNumber?: number | string;
      };

      if (json.result === 100 || json.result === 101) {
        return {
          status: "VERIFIED",
          paidAmountRial: json.amount ? BigInt(json.amount) : undefined,
          traceNumber: json.refNumber?.toString(),
          raw: json as Record<string, unknown>,
        };
      }

      if (json.result === 201 || json.result === 202) {
        return {
          status: "FAILED",
          raw: json as Record<string, unknown>,
        };
      }

      return { status: "UNKNOWN", raw: json as Record<string, unknown> };
    } catch (err) {
      return {
        status: "UNKNOWN",
        raw: { error: err instanceof Error ? err.message : String(err) },
      };
    }
  }
}

export const zibalAdapter = new ZibalAdapter();
registerGatewayAdapter(zibalAdapter);
