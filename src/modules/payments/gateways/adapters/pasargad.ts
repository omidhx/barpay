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

export class PasargadAdapter implements PaymentProvider {
  readonly code = "PASARGAD" as const;

  private signData(data: string, privateKeyPem: string): string {
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(data);
    sign.end();
    return sign.sign(privateKeyPem, "base64");
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const { amountRial, callbackUrl, state, driverMobile, credentials } = input;
    const merchantId = String(credentials.merchantId || credentials.merchant_id || "");
    const terminalCode = String(credentials.terminalCode || "");
    const privateKey = String(credentials.privateKey || "");

    const now = new Date().toISOString();
    const payload = {
      amount: Number(amountRial),
      callbackUrl,
      invoiceNumber: state,
      invoiceDate: now,
      merchantCode: merchantId,
      terminalCode,
      mobile: driverMobile,
    };

    let signature = "";
    if (privateKey) {
      try {
        signature = this.signData(JSON.stringify(payload), privateKey);
      } catch {
        // Fallback for mock/test keys
        signature = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("base64");
      }
    }

    const response = await fetch("https://pep.shaparak.ir/Api/v1/Payment/GetToken", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Signature: signature,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    const json = (await response.json()) as {
      IsSuccess?: boolean;
      Token?: string;
      Message?: string;
    };

    if (!response.ok || !json.IsSuccess || !json.Token) {
      throw new Error(`PASARGAD_INIT_FAILED: ${json.Message || "Unknown error"}`);
    }

    const token = json.Token;
    return {
      providerReference: token,
      redirect: {
        method: "GET",
        url: `https://pep.shaparak.ir/payment.aspx?n=${token}`,
      },
      raw: json as Record<string, unknown>,
    };
  }

  async verifyTransaction(input: VerifyTransactionInput): Promise<VerifyTransactionResult> {
    const { providerReference, amountRial, callbackPayload, credentials } = input;
    const merchantId = String(credentials.merchantId || credentials.merchant_id || "");
    const privateKey = String(credentials.privateKey || "");

    const invoiceNumber = String(callbackPayload?.invoiceNumber || callbackPayload?.iN || "");
    const payload = {
      invoiceNumber,
      token: providerReference,
      merchantCode: merchantId,
    };

    let signature = "";
    if (privateKey) {
      try {
        signature = this.signData(JSON.stringify(payload), privateKey);
      } catch {
        signature = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("base64");
      }
    }

    const response = await fetch("https://pep.shaparak.ir/Api/v1/Payment/VerifyPayment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Signature: signature,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    const json = (await response.json()) as {
      IsSuccess?: boolean;
      Amount?: number;
      MaskedPan?: string;
      TraceNumber?: string;
      ReferenceNumber?: string;
      Message?: string;
    };

    const verified = Boolean(json.IsSuccess);
    let paidAmountRial: bigint | undefined;
    if (verified) {
      paidAmountRial = json.Amount ? BigInt(json.Amount) : amountRial;
    }

    return {
      verified,
      paidAmountRial,
      maskedPan: json.MaskedPan,
      traceNumber: json.TraceNumber,
      referenceNumber: json.ReferenceNumber || providerReference,
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

export const pasargadAdapter = new PasargadAdapter();
registerGatewayAdapter(pasargadAdapter);
