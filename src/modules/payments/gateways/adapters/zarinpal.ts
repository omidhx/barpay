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

export class ZarinpalAdapter implements PaymentProvider {
  readonly code = "ZARINPAL" as const;

  private getBaseUrl(sandbox?: boolean): string {
    return sandbox
      ? "https://sandbox.zarinpal.com/pg/v4/payment"
      : "https://payment.zarinpal.com/pg/v4/payment";
  }

  private getStartPayUrl(authority: string, sandbox?: boolean): string {
    return sandbox
      ? `https://sandbox.zarinpal.com/pg/StartPay/${authority}`
      : `https://payment.zarinpal.com/pg/StartPay/${authority}`;
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const { amountRial, waybillNumber, driverMobile, callbackUrl, state, credentials, sandbox } =
      input;
    const merchantId = String(credentials.merchantId || credentials.merchant_id || "");

    // Rial to Toman conversion exclusively inside Zarinpal adapter
    const amountToman = Number(amountRial / 10n);

    const baseUrl = this.getBaseUrl(sandbox);
    const response = await fetch(`${baseUrl}/request.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: amountToman,
        callback_url: callbackUrl,
        description: `پرداخت بارنامه ${waybillNumber}`,
        metadata: {
          mobile: driverMobile,
          order_id: state,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    const json = (await response.json()) as {
      data?: { code: number; authority: string; message?: string };
      errors?: Array<{ code: number; message: string }> | Record<string, unknown>;
    };

    if (!response.ok || !json.data || json.data.code !== 100) {
      const errCode = json.data?.code || "UNKNOWN";
      throw new Error(`ZARINPAL_INIT_FAILED: Code ${errCode}`);
    }

    const authority = json.data.authority;
    return {
      providerReference: authority,
      redirect: {
        method: "GET",
        url: this.getStartPayUrl(authority, sandbox),
      },
      raw: json as Record<string, unknown>,
    };
  }

  async verifyTransaction(input: VerifyTransactionInput): Promise<VerifyTransactionResult> {
    const { providerReference, amountRial, credentials, sandbox } = input;
    const merchantId = String(credentials.merchantId || credentials.merchant_id || "");
    const amountToman = Number(amountRial / 10n);

    const baseUrl = this.getBaseUrl(sandbox);
    const response = await fetch(`${baseUrl}/verify.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: amountToman,
        authority: providerReference,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const json = (await response.json()) as {
      data?: {
        code: number;
        ref_id?: number | string;
        card_pan?: string;
        card_hash?: string;
        fee_type?: string;
        fee?: number;
      };
      errors?: Array<{ code: number; message: string }> | Record<string, unknown>;
    };

    // Code 100 = verified successfully, 101 = already verified (idempotent success)
    const code = json.data?.code;
    const verified = code === 100 || code === 101;

    let paidAmountRial: bigint | undefined;
    if (verified) {
      // Toman back to Rial (always * 10)
      paidAmountRial = BigInt(amountToman) * 10n;
    }

    return {
      verified,
      paidAmountRial,
      maskedPan: json.data?.card_pan,
      traceNumber: json.data?.ref_id?.toString(),
      referenceNumber: json.data?.ref_id?.toString(),
      raw: json as Record<string, unknown>,
    };
  }

  async inquiryTransaction(input: InquiryTransactionInput): Promise<InquiryTransactionResult> {
    const { providerReference, credentials, sandbox } = input;
    const merchantId = String(credentials.merchantId || credentials.merchant_id || "");

    // In Zarinpal v4, checking verify.json with original authority can check status
    try {
      const baseUrl = this.getBaseUrl(sandbox);
      const response = await fetch(`${baseUrl}/verify.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: 0, // In inquiry, amount may be unknown or tested
          authority: providerReference,
        }),
        signal: AbortSignal.timeout(10000),
      });

      const json = (await response.json()) as {
        data?: { code: number; ref_id?: number | string };
      };

      if (json.data?.code === 100 || json.data?.code === 101) {
        return {
          status: "VERIFIED",
          traceNumber: json.data.ref_id?.toString(),
          raw: json as Record<string, unknown>,
        };
      }

      if (json.data?.code && json.data.code < 0) {
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

export const zarinpalAdapter = new ZarinpalAdapter();
registerGatewayAdapter(zarinpalAdapter);
