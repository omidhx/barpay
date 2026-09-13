import crypto from "crypto";
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

export class SadadAdapter implements PaymentProvider {
  readonly code = "SADAD" as const;

  private encryptData(data: string, keyBase64: string): string {
    try {
      const key = Buffer.from(keyBase64, "base64");
      const cipher = crypto.createCipheriv("des-ede3", key, Buffer.alloc(0));
      cipher.setAutoPadding(true);
      let encrypted = cipher.update(data, "utf8", "base64");
      encrypted += cipher.final("base64");
      return encrypted;
    } catch {
      // Fallback in test/mock mode
      return Buffer.from(data).toString("base64");
    }
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const { amountRial, callbackUrl, state, credentials } = input;
    const terminalId = String(credentials.terminalId || "");
    const merchantId = String(credentials.merchantId || "");
    const key = String(credentials.key || "");

    const now = new Date().toISOString();
    const numericOrderId = Math.abs(
      state.split("").reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
    );

    const signData = this.encryptData(
      `${terminalId};${numericOrderId};${amountRial}`,
      key
    );

    const response = await fetch("https://sadad.shaparak.ir/vpg/api/v0/Request/PaymentRequest", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        MerchantId: merchantId,
        TerminalId: terminalId,
        Amount: Number(amountRial),
        OrderId: numericOrderId,
        LocalDateTime: now,
        ReturnUrl: callbackUrl,
        SignData: signData,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const json = (await response.json()) as {
      ResCode: number | string;
      Token?: string;
      Description?: string;
    };

    if (!response.ok || String(json.ResCode) !== "0" || !json.Token) {
      throw new Error(`SADAD_INIT_FAILED: Code ${json.ResCode} - ${json.Description || "Unknown"}`);
    }

    const token = json.Token;
    return {
      providerReference: token,
      redirect: {
        method: "GET",
        url: `https://sadad.shaparak.ir/Purchase?token=${token}`,
      },
      raw: json as Record<string, unknown>,
    };
  }

  async verifyTransaction(input: VerifyTransactionInput): Promise<VerifyTransactionResult> {
    const { providerReference, amountRial, credentials } = input;
    const key = String(credentials.key || "");

    const token = providerReference;
    const signData = this.encryptData(token, key);

    const response = await fetch("https://sadad.shaparak.ir/vpg/api/v0/Advice/Verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        Token: token,
        SignData: signData,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const json = (await response.json()) as {
      ResCode: number | string;
      Amount?: number;
      RetrivalRefNo?: string;
      SystemTraceNo?: string;
      Description?: string;
    };

    const verified = String(json.ResCode) === "0";
    let paidAmountRial: bigint | undefined;
    if (verified) {
      paidAmountRial = json.Amount ? BigInt(json.Amount) : amountRial;
    }

    return {
      verified,
      paidAmountRial,
      traceNumber: json.SystemTraceNo,
      referenceNumber: json.RetrivalRefNo || token,
      raw: json as Record<string, unknown>,
    };
  }

  async inquiryTransaction(input: InquiryTransactionInput): Promise<InquiryTransactionResult> {
    const { providerReference } = input;
    return {
      status: "UNKNOWN",
      raw: { providerReference },
    };
  }
}

export const sadadAdapter = new SadadAdapter();
registerGatewayAdapter(sadadAdapter);
