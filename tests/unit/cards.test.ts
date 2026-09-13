import { describe, it, expect } from "vitest";
import { isValidCardNumber, getBankInfoFromCard, formatCardNumber } from "@/lib/utils/luhn";
import { isValidIranianIban, formatIranianIban } from "@/lib/utils/iban";

describe("Bank Card & Luhn Algorithm Validation (business-rules.md Decision 21)", () => {
  it("validates correct 16-digit Iranian bank card numbers using Luhn checksum", () => {
    // Valid card numbers with correct Luhn check
    expect(isValidCardNumber("6037991122334455")).toBe(true);
    expect(isValidCardNumber("6104337788990016")).toBe(true);
    expect(isValidCardNumber("۶۰۳۷۹۹۱۱۲۲۳۳۴۴۵۵")).toBe(true); // Persian digits
    expect(isValidCardNumber("6037-9911-2233-4455")).toBe(true); // formatted
  });

  it("rejects invalid card numbers with incorrect Luhn check or length", () => {
    expect(isValidCardNumber("6037991122334450")).toBe(false); // bad checksum
    expect(isValidCardNumber("123456")).toBe(false); // too short
    expect(isValidCardNumber("6037991122334451234")).toBe(false); // too long
    expect(isValidCardNumber("")).toBe(false);
  });

  it("correctly identifies bank from 6-digit BIN prefix", () => {
    expect(getBankInfoFromCard("6037991122334455").code).toBe("BMI");
    expect(getBankInfoFromCard("6104337788990016").code).toBe("BPM");
    expect(getBankInfoFromCard("6219861122334450").code).toBe("SAMAN");
    expect(getBankInfoFromCard("5022291122334459").code).toBe("PASARGAD");
  });

  it("formats 16-digit card into 4-4-4-4 format", () => {
    expect(formatCardNumber("6037991122334455")).toBe("6037 - 9911 - 2233 - 4455");
  });
});

describe("Iranian IBAN (Sheba) MOD-97 Validation (ISO 7064 / 13616)", () => {
  it("validates correct Iranian IBAN with valid MOD-97 remainder", () => {
    // Valid Iranian Sheba: 0170000000100324200001 with check digits 27
    expect(isValidIranianIban("IR270170000000100324200001")).toBe(true);
    expect(isValidIranianIban("ir270170000000100324200001")).toBe(true); // lowercase
    expect(isValidIranianIban("IR27 0170 0000 0010 0324 2000 01")).toBe(true); // with spaces
    expect(isValidIranianIban("IR۲۷۰۱۷۰۰۰۰۰۰۰۱۰۰۳۲۴۲۰۰۰۰۱")).toBe(true); // Persian digits
  });

  it("rejects invalid IBAN numbers", () => {
    expect(isValidIranianIban("IR280170000000100324200001")).toBe(false); // bad checksum
    expect(isValidIranianIban("GB270170000000100324200001")).toBe(false); // non-IR
    expect(isValidIranianIban("IR123")).toBe(false); // too short
    expect(isValidIranianIban("")).toBe(false);
  });

  it("formats IBAN cleanly into readable groups", () => {
    expect(formatIranianIban("IR270170000000100324200001")).toBe(
      "IR27 0170 0000 0010 0324 2000 01"
    );
  });
});
