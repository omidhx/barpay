import { describe, it, expect } from "vitest";
import {
  renderCommitmentText,
  validateSignatureBuffer,
  PNG_MAGIC_BYTES,
  MAX_SIGNATURE_SIZE_BYTES,
} from "@/modules/commitments/commitment-service";
import { AppError } from "@/lib/errors/exceptions";

describe("Commitment Rendering & Signature Verification (business-rules.md §9)", () => {
  it("successfully renders variables: {{driver_name}}, {{amount}}, {{waybill_number}}", () => {
    const template =
      "اینجانب {{driver_name}} با بارنامه {{waybill_number}} مبلغ {{amount}} ریال را متعهد می‌شوم.";
    const variables = {
      driver_name: "علی رضایی",
      waybill_number: "8605186",
      amount: "81,400,000",
    };

    const rendered = renderCommitmentText(template, variables);
    expect(rendered).toBe(
      "اینجانب علی رضایی با بارنامه 8605186 مبلغ 81,400,000 ریال را متعهد می‌شوم."
    );
  });

  it("throws TEMPLATE_VARIABLE_UNRESOLVED if any placeholder remains unmapped", () => {
    const template =
      "اینجانب {{driver_name}} بارنامه {{waybill_number}} از مبدا {{origin}} به مقصد {{destination}} را تایید می‌نمایم.";
    const variables = {
      driver_name: "علی رضایی",
      waybill_number: "8605186",
      // origin and destination are missing!
    };

    expect(() => renderCommitmentText(template, variables)).toThrowError(AppError);
    try {
      renderCommitmentText(template, variables);
    } catch (err: unknown) {
      const appErr = err as AppError;
      expect(appErr.code).toBe("TEMPLATE_VARIABLE_UNRESOLVED");
      expect(appErr.message).toContain("origin");
      expect(appErr.message).toContain("destination");
    }
  });

  it("validates signature PNG format and rejects non-PNG", () => {
    const validPng = Buffer.concat([PNG_MAGIC_BYTES, Buffer.alloc(300, 0x55)]);
    expect(() => validateSignatureBuffer(validPng)).not.toThrow();

    const invalidBuffer = Buffer.from("GIF89a...");
    expect(() => validateSignatureBuffer(invalidBuffer)).toThrowError(AppError);
    try {
      validateSignatureBuffer(invalidBuffer);
    } catch (err: unknown) {
      expect((err as AppError).code).toBe("INVALID_SIGNATURE_FORMAT");
    }
  });

  it("rejects signature exceeding 500KB (SIGNATURE_TOO_LARGE)", () => {
    const hugeBuffer = Buffer.concat([
      PNG_MAGIC_BYTES,
      Buffer.alloc(MAX_SIGNATURE_SIZE_BYTES + 1024),
    ]);
    expect(() => validateSignatureBuffer(hugeBuffer)).toThrowError(AppError);
    try {
      validateSignatureBuffer(hugeBuffer);
    } catch (err: unknown) {
      expect((err as AppError).code).toBe("SIGNATURE_TOO_LARGE");
    }
  });
});
