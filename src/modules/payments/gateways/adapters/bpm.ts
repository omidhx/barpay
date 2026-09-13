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

export class BpmAdapter implements PaymentProvider {
  readonly code = "BPM" as const;

  private getSoapUrl(): string {
    return "https://bpm.shaparak.ir/pgwchannel/services/pgws";
  }

  private buildSoapEnvelope(methodName: string, params: Record<string, string | number>): string {
    const inner = Object.entries(params)
      .map(([k, v]) => `<${k}>${v}</${k}>`)
      .join("");
    return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:bpg="http://interfaces.core.pgw.bpm.softcomp.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <bpg:${methodName}>
      ${inner}
    </bpg:${methodName}>
  </soapenv:Body>
</soapenv:Envelope>`;
  }

  private async callSoap(
    methodName: string,
    params: Record<string, string | number>
  ): Promise<string> {
    const xml = this.buildSoapEnvelope(methodName, params);
    const response = await fetch(this.getSoapUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        SOAPAction: `""`,
      },
      body: xml,
      signal: AbortSignal.timeout(10000),
    });

    const text = await response.text();
    // Extract return value from SOAP XML
    const match = text.match(/<return>(.*?)<\/return>/s);
    return match ? match[1].trim() : text;
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const { amountRial, callbackUrl, state, credentials } = input;
    const terminalId = Number(credentials.terminalId || 0);
    const userName = String(credentials.userName || "");
    const userPassword = String(credentials.userPassword || "");

    const now = new Date();
    const localDate = now.toISOString().slice(0, 10).replace(/-/g, "");
    const localTime = now.toTimeString().slice(0, 8).replace(/:/g, "");

    // Convert string state to numeric or alphanumeric orderId
    const numericOrderId = Math.abs(
      state.split("").reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
    );

    const result = await this.callSoap("bpPayRequest", {
      terminalId,
      userName,
      userPassword,
      orderId: numericOrderId,
      amount: Number(amountRial),
      localDate,
      localTime,
      additionalData: "",
      callBackUrl: callbackUrl,
      payerId: 0,
    });

    const parts = result.split(",");
    const resCode = parts[0];
    const refId = parts[1];

    if (resCode !== "0" || !refId) {
      throw new Error(`BPM_INIT_FAILED: Response code ${resCode}`);
    }

    return {
      providerReference: refId,
      redirect: {
        method: "POST",
        url: "https://bpm.shaparak.ir/pgwchannel/startpay.mellat",
        formFields: {
          RefNum: refId,
        },
      },
      raw: { resCode, refId, raw: result },
    };
  }

  async verifyTransaction(input: VerifyTransactionInput): Promise<VerifyTransactionResult> {
    const { providerReference, amountRial, callbackPayload, credentials } = input;
    const terminalId = Number(credentials.terminalId || 0);
    const userName = String(credentials.userName || "");
    const userPassword = String(credentials.userPassword || "");

    const orderId = Number(callbackPayload?.SaleOrderId || callbackPayload?.orderId || 0);
    const saleOrderId = Number(callbackPayload?.SaleOrderId || orderId);
    const saleReferenceId = Number(callbackPayload?.SaleReferenceId || 0);

    // Step 1: bpVerifyRequest
    const verifyRes = await this.callSoap("bpVerifyRequest", {
      terminalId,
      userName,
      userPassword,
      orderId,
      saleOrderId,
      saleReferenceId,
    });

    if (verifyRes !== "0") {
      return {
        verified: false,
        raw: { step: "verify", verifyRes, callbackPayload },
      };
    }

    // Step 2: bpSettleRequest
    const settleRes = await this.callSoap("bpSettleRequest", {
      terminalId,
      userName,
      userPassword,
      orderId,
      saleOrderId,
      saleReferenceId,
    });

    if (settleRes !== "0" && settleRes !== "45") {
      // 45 = Already settled
      // Attempt reversal if settle fails
      try {
        await this.callSoap("bpReversalRequest", {
          terminalId,
          userName,
          userPassword,
          orderId,
          saleOrderId,
          saleReferenceId,
        });
      } catch {
        // Logged in raw
      }

      return {
        verified: false,
        raw: { step: "settle_failed_reversal_attempted", verifyRes, settleRes },
      };
    }

    return {
      verified: true,
      paidAmountRial: amountRial,
      traceNumber: saleReferenceId ? String(saleReferenceId) : undefined,
      referenceNumber: providerReference,
      raw: { verifyRes, settleRes, saleReferenceId },
    };
  }

  async inquiryTransaction(input: InquiryTransactionInput): Promise<InquiryTransactionResult> {
    const { credentials } = input;
    const terminalId = Number(credentials.terminalId || 0);
    const userName = String(credentials.userName || "");
    const userPassword = String(credentials.userPassword || "");

    try {
      const res = await this.callSoap("bpInquiryRequest", {
        terminalId,
        userName,
        userPassword,
        orderId: 0,
        saleOrderId: 0,
        saleReferenceId: 0,
      });

      if (res === "0") {
        return { status: "VERIFIED", raw: { res } };
      }
      return { status: "UNKNOWN", raw: { res } };
    } catch (err) {
      return {
        status: "UNKNOWN",
        raw: { error: err instanceof Error ? err.message : String(err) },
      };
    }
  }
}

export const bpmAdapter = new BpmAdapter();
registerGatewayAdapter(bpmAdapter);
