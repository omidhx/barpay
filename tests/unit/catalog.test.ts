import { describe, it, expect } from "vitest";
import { ERROR_CATALOG, getErrorResponse } from "@/lib/errors/catalog";

describe("ERROR_CATALOG — System Error Catalog (api-contracts.md & catalog.ts)", () => {
  it("contains essential business and security error codes", () => {
    const requiredCodes = [
      "COMMITMENT_NOT_ACCEPTED",
      "COMMITMENT_DECLINED",
      "COMMITMENT_NO_ACTIVE_VERSION",
      "TEMPLATE_VARIABLE_UNRESOLVED",
      "PAYMENT_STATE_CONFLICT",
      "PAYMENT_ALREADY_REVIEWED",
      "OVERPAYMENT_REQUIRES_DISCREPANCY",
      "AMOUNT_CHANGED",
      "PAYMENT_TRACKING_DUPLICATE",
      "GATEWAY_AMOUNT_MISMATCH",
      "GATEWAY_CALLBACK_INVALID",
      "GATEWAY_REFERENCE_DUPLICATE",
      "GATEWAY_ATTEMPT_LOCKED",
      "DOCUMENT_NOT_VERIFIED",
      "PAYMENT_NOT_SETTLED",
      "RELEASE_NOT_AUTHORIZED",
      "WAYBILL_NOT_ACTIVE",
      "IDEMPOTENCY_KEY_REUSED",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
      "INTERNAL_ERROR",
    ];

    for (const code of requiredCodes) {
      expect(ERROR_CATALOG[code]).toBeDefined();
      expect(ERROR_CATALOG[code].code).toBe(code);
      expect(typeof ERROR_CATALOG[code].humanMessage).toBe("string");
      expect(ERROR_CATALOG[code].humanMessage.length).toBeGreaterThan(0);
      expect(typeof ERROR_CATALOG[code].httpStatus).toBe("number");
      expect(typeof ERROR_CATALOG[code].retryable).toBe("boolean");
    }
  });

  it("formats standard error response envelope using getErrorResponse", () => {
    const res = getErrorResponse("COMMITMENT_NOT_ACCEPTED", "corr-12345");

    expect(res.ok).toBe(false);
    expect(res.data).toBeNull();
    expect(res.error).toBeDefined();
    expect(res.error.code).toBe("COMMITMENT_NOT_ACCEPTED");
    expect(res.error.humanMessage).toBe("پذیرش تعهدنامه پیش از اقدام به پرداخت الزامی است.");
    expect(res.error.actionHint).toBe("ابتدا متن تعهدنامه را مطالعه و تأیید کنید.");
    expect(res.error.retryable).toBe(false);
    expect(res.error.correlationId).toBe("corr-12345");
  });

  it("handles unknown error codes gracefully with fallback message", () => {
    const res = getErrorResponse("SOME_UNKNOWN_ERROR_CODE");

    expect(res.ok).toBe(false);
    expect(res.data).toBeNull();
    expect(res.error.code).toBe("SOME_UNKNOWN_ERROR_CODE");
    expect(res.error.humanMessage).toBe("خطای نامشخص در سامانه رخ داده است.");
    expect(res.error.retryable).toBe(false);
    expect(res.error.correlationId).toBeDefined();
  });
});
