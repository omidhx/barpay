import { describe, it, expect } from "vitest";
import { normalizeDigits, normalizeMobile } from "@/lib/utils/digits";

describe("normalizeDigits — Persian/Arabic to Latin digits conversion", () => {
  it("converts Persian digits ۰-۹ to Latin 0-9", () => {
    expect(normalizeDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });

  it("converts Arabic digits ٠-٩ to Latin 0-9", () => {
    expect(normalizeDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });

  it("handles mixed strings preserving non-digit characters", () => {
    expect(normalizeDigits("شماره: ۰۹۱۲-۳۴۵-۶۷۸۹")).toBe("شماره: 0912-345-6789");
    expect(normalizeDigits("Amount: ۱۲,۵۰۰,۰۰۰ Rials")).toBe("Amount: 12,500,000 Rials");
  });

  it("handles null, undefined and empty strings safely", () => {
    expect(normalizeDigits(null)).toBe("");
    expect(normalizeDigits(undefined)).toBe("");
    expect(normalizeDigits("")).toBe("");
  });
});

describe("normalizeMobile — Iranian Mobile normalizer (09xxxxxxxxx)", () => {
  it("normalizes standard 11-digit mobile starting with 09", () => {
    expect(normalizeMobile("09123456789")).toBe("09123456789");
  });

  it("normalizes Persian and Arabic digit mobiles", () => {
    expect(normalizeMobile("۰۹۱۲۳۴۵۶۷۸۹")).toBe("09123456789");
    expect(normalizeMobile("٠٩١٢٣٤٥٦٧٨٩")).toBe("09123456789");
  });

  it("normalizes international formats (+98, 0098, 98)", () => {
    expect(normalizeMobile("+989123456789")).toBe("09123456789");
    expect(normalizeMobile("00989123456789")).toBe("09123456789");
    expect(normalizeMobile("989123456789")).toBe("09123456789");
  });

  it("normalizes 10-digit format starting with 9", () => {
    expect(normalizeMobile("9123456789")).toBe("09123456789");
  });

  it("strips whitespace, dashes, and extra formatting", () => {
    expect(normalizeMobile(" 0912-345-6789 ")).toBe("09123456789");
    expect(normalizeMobile("+98 (912) 345 6789")).toBe("09123456789");
  });

  it("returns null for invalid phone numbers", () => {
    expect(normalizeMobile("02188776655")).toBeNull(); // Landline
    expect(normalizeMobile("0912345678")).toBeNull(); // Too short
    expect(normalizeMobile("091234567890")).toBeNull(); // Too long
    expect(normalizeMobile("abc09123456789def")).toBe("09123456789"); // Cleans non-digits
    expect(normalizeMobile("invalid")).toBeNull();
    expect(normalizeMobile("")).toBeNull();
    expect(normalizeMobile(null)).toBeNull();
  });
});
