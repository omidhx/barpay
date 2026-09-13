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

export class SepAdapter implements PaymentProvider {
  readonly code = "SEP" as const;

  private getAuthHeader(terminalId: string, transactionKey: string): string {
    const credentials = Buffer.from(`${terminalId}:${transactionKey}`).toString("base64");
    return `Basic ${credentials}`;
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const { amountRial, driverMobile, callbackUrl, state, credentials } = input;
    const terminalId = String(credentials.terminalId || "");
    const transactionKey = String(credentials.transactionKey || "");

    const response = await fetch("https://sep.shaparak.ir/api/v1/Payment/GetToken", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: this.getAuthHeader(terminalId, transactionKey),
      },
      body: JSON.stringify({
        action: "token",
        terminalId,
        amount: Number(amountRial),
        resNum: state,
        redirectUrl: callbackUrl,
        cellNumber: driverMobile,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const json = (await response.json()) as {
      status: number;
      token?: string;
      errorCode?: number;
      errorDesc?: string;
    };

    if (!response.ok || json.status !== 1 || !json.token) {
      throw new Error(`SEP_INIT_FAILED: ${json.errorCode} - ${json.errorDesc || "Unknown error"}`);
    }

    const token = json.token;
    return {
      providerReference: token,
      redirect: {
        method: "POST",
        url: "https://sep.shaparak.ir/OnlinePayments/InitPayment/Pay",
        formFields: {
          Token: token,
          GetMethod: "false",
        },
      },
      raw: json as Record<string, unknown>,
    };
  }

  async verifyTransaction(input: VerifyTransactionInput): Promise<VerifyTransactionResult> {
    const { providerReference, amountRial, credentials } = input;
    const terminalId = String(credentials.terminalId || "");
    const transactionKey = String(credentials.transactionKey || "");

    const response = await fetch("https://sep.shaparak.ir/api/v1/Payment/VerifyTxn", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: this.getAuthHeader(terminalId, transactionKey),
      },
      body: JSON.stringify({
        action: "verify",
        refNum: providerReference,
        terminalNumber: Number(terminalId) || undefined,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const json = (await response.json()) as {
      success?: boolean;
      status?: number;
      transactionDetail?: {
        affectiveAmount?: number;
        maskedPan?: string;
        straceNo?: string;
        refNum?: string;
      };
      errorCode?: number;
      errorDesc?: string;
    };

    const verified = Boolean(json.success || json.status === 1 || json.status === 0);
    const detail = json.transactionDetail;

    let paidAmountRial: bigint | undefined;
    if (verified) {
      paidAmountRial =
        detail?.affectiveAmount !== undefined ? BigInt(detail.affectiveAmount) : amountRial;
    }

    return {
      verified,
      paidAmountRial,
      maskedPan: detail?.maskedPan,
      traceNumber: detail?.straceNo,
      referenceNumber: detail?.refNum || providerReference,
      raw: json as Record<string, unknown>,
    };
  }

  async inquiryTransaction(input: InquiryTransactionInput): Promise<InquiryTransactionResult> {
    const { providerReference, credentials } = input;
    const terminalId = String(credentials.terminalId || "");
    const transactionKey = String(credentials.transactionKey || "");

    try {
      const response = await fetch("https://sep.shaparak.ir/api/v1/Payment/CheckTxn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.getAuthHeader(terminalId, transactionKey),
        },
        body: JSON.stringify({
          action: "check",
          refNum: providerReference,
        }),
        signal: AbortSignal.timeout(10000),
      });

      const json = (await response.json()) as {
        status?: number;
        transactionDetail?: {
          affectiveAmount?: number;
          straceNo?: string;
        };
      };

      if (json.status === 1 || json.status === 0) {
        return {
          status: "VERIFIED",
          paidAmountRial: json.transactionDetail?.affectiveAmount
            ? BigInt(json.transactionDetail.affectiveAmount)
            : undefined,
          traceNumber: json.transactionDetail?.straceNo,
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

export const sepAdapter = new SepAdapter();
registerGatewayAdapter(sepAdapter);
