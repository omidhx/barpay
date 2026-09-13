import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  gatewayAdapters,
  getGatewayAdapter,
  GatewayProviderCode,
} from "@/modules/payments/gateways/adapters";
import { zarinpalAdapter } from "@/modules/payments/gateways/adapters/zarinpal";
import { zibalAdapter } from "@/modules/payments/gateways/adapters/zibal";
import { sepAdapter } from "@/modules/payments/gateways/adapters/sep";
import { bpmAdapter } from "@/modules/payments/gateways/adapters/bpm";

describe("Payment Gateway Adapters & Unit Conversions (payment-gateways.md & Appendix C)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("ensures all 6 adapters are registered in registry", () => {
    const requiredCodes: GatewayProviderCode[] = [
      "SEP",
      "BPM",
      "PASARGAD",
      "SADAD",
      "ZARINPAL",
      "ZIBAL",
    ];

    for (const code of requiredCodes) {
      const adapter = getGatewayAdapter(code);
      expect(adapter).toBeDefined();
      expect(adapter.code).toBe(code);
    }
  });

  describe("Zarinpal Adapter (Toman conversion & idempotent codes 100/101)", () => {
    it("converts Rial to Toman on request (divide by 10) for official golden amount", async () => {
      // Golden test amount: 80,700,000 Rials -> 8,070,000 Tomans
      let capturedBody: any;
      global.fetch = vi.fn().mockImplementation(async (_url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({ data: { code: 100, authority: "A0000000000000000000000000000000001" } }),
        };
      });

      const res = await zarinpalAdapter.initiatePayment({
        amountRial: 80700000n,
        waybillNumber: "BL-8605186",
        driverMobile: "09121112233",
        callbackUrl: "https://example.com/callback",
        state: "test-state-1",
        credentials: { merchantId: "550e8400-e29b-41d4-a716-446655440000" },
        sandbox: true,
      });

      expect(capturedBody.amount).toBe(8070000); // Toman: 80,700,000 / 10
      expect(res.providerReference).toBe("A0000000000000000000000000000000001");
      expect(res.redirect.url).toContain("sandbox.zarinpal.com");
    });

    it("treats code 100 as verified and converts Toman back to Rial (*10)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { code: 100, ref_id: 123456, card_pan: "603799******4451" },
        }),
      });

      const res = await zarinpalAdapter.verifyTransaction({
        providerReference: "A0000000000000000000000000000000001",
        amountRial: 13750000n, // Golden test amount 2: 13,750,000 Rials
        credentials: { merchantId: "mock-id" },
      });

      expect(res.verified).toBe(true);
      expect(res.paidAmountRial).toBe(13750000n); // Converted back to Rials
      expect(res.traceNumber).toBe("123456");
      expect(res.maskedPan).toBe("603799******4451");
    });

    it("treats code 101 as idempotent success without error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { code: 101, ref_id: 123456 },
        }),
      });

      const res = await zarinpalAdapter.verifyTransaction({
        providerReference: "A0000000000000000000000000000000001",
        amountRial: 5000000n,
        credentials: { merchantId: "mock-id" },
      });

      expect(res.verified).toBe(true);
      expect(res.paidAmountRial).toBe(5000000n);
    });
  });

  describe("Zibal Adapter (Rials & idempotent codes 100/101)", () => {
    it("initiates in Rials without unit conversion and uses zibal sandbox merchant", async () => {
      let capturedBody: any;
      global.fetch = vi.fn().mockImplementation(async (_url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({ result: 100, trackId: 987654321, message: "success" }),
        };
      });

      const res = await zibalAdapter.initiatePayment({
        amountRial: 80700000n,
        waybillNumber: "BL-8605186",
        driverMobile: "09121112233",
        callbackUrl: "https://example.com/callback",
        state: "zibal-state-1",
        credentials: {},
        sandbox: true,
      });

      expect(capturedBody.amount).toBe(80700000); // strictly Rials
      expect(capturedBody.merchant).toBe("zibal");
      expect(res.providerReference).toBe("987654321");
      expect(res.redirect.url).toBe("https://gateway.zibal.ir/start/987654321");
    });

    it("verifies result 100 and result 101 as successful", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: 100,
          amount: 80700000,
          refNumber: "REF-112233",
          cardNumber: "610433******0013",
        }),
      });

      const res = await zibalAdapter.verifyTransaction({
        providerReference: "987654321",
        amountRial: 80700000n,
        credentials: {},
      });

      expect(res.verified).toBe(true);
      expect(res.paidAmountRial).toBe(80700000n);
      expect(res.traceNumber).toBe("REF-112233");
    });
  });

  describe("SEP Adapter (Saman)", () => {
    it("initiates with Basic auth and returns POST redirect form", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 1,
          token: "sep-token-12345",
        }),
      });

      const res = await sepAdapter.initiatePayment({
        amountRial: 50000000n,
        waybillNumber: "BL-100",
        driverMobile: "09121112233",
        callbackUrl: "https://example.com/callback",
        state: "sep-state-1",
        credentials: { terminalId: "12345", transactionKey: "secret" },
      });

      expect(res.providerReference).toBe("sep-token-12345");
      expect(res.redirect.method).toBe("POST");
      expect(res.redirect.formFields?.Token).toBe("sep-token-12345");
    });
  });

  describe("BPM Adapter (Mellat Two-stage verify)", () => {
    it("executes both bpVerifyRequest and bpSettleRequest", async () => {
      const calls: string[] = [];
      global.fetch = vi.fn().mockImplementation(async (_url, opts) => {
        const body = opts.body as string;
        if (body.includes("bpVerifyRequest")) {
          calls.push("verify");
          return {
            ok: true,
            text: async () => "<return>0</return>",
          };
        }
        if (body.includes("bpSettleRequest")) {
          calls.push("settle");
          return {
            ok: true,
            text: async () => "<return>0</return>",
          };
        }
        return { ok: true, text: async () => "<return>0</return>" };
      });

      const res = await bpmAdapter.verifyTransaction({
        providerReference: "bpm-ref-123",
        amountRial: 25000000n,
        callbackPayload: { SaleOrderId: 1001, SaleReferenceId: 2002 },
        credentials: { terminalId: "123", userName: "user", userPassword: "pwd" },
      });

      expect(calls).toEqual(["verify", "settle"]);
      expect(res.verified).toBe(true);
      expect(res.traceNumber).toBe("2002");
    });
  });
});
