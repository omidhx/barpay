import { describe, it, expect } from "vitest";
import {
  calculateWaybillAmount,
  calculateResidualAmount,
  DEFAULT_ROUND_MULTIPLE,
  DEFAULT_SURCHARGE_AMOUNT,
} from "@/lib/waybills/amount";

describe("calculateWaybillAmount — Core payable amount chain (business-rules §3)", () => {
  it("executes official Golden Test 1: 80,686,445 IRR -> 80,700,000 (+700k = 81,400,000)", () => {
    const result = calculateWaybillAmount({
      rawExcelAmount: 80_686_445n,
      roundMultiple: 50_000n,
      surchargeAmount: 700_000n,
      applySurcharge: true,
    });

    expect(result.rawExcelAmount).toBe(80_686_445n);
    expect(result.roundedAmount).toBe(80_700_000n);
    expect(result.surchargeAmount).toBe(700_000n);
    expect(result.amount).toBe(81_400_000n);
  });

  it("executes official Golden Test 2: 13,712,500 IRR -> 13,750,000 (+700k = 14,450,000)", () => {
    const result = calculateWaybillAmount({
      rawExcelAmount: 13_712_500n,
      roundMultiple: 50_000n,
      surchargeAmount: 700_000n,
      applySurcharge: true,
    });

    expect(result.rawExcelAmount).toBe(13_712_500n);
    expect(result.roundedAmount).toBe(13_750_000n);
    expect(result.surchargeAmount).toBe(700_000n);
    expect(result.amount).toBe(14_450_000n);
  });

  it("handles exact multiples without extra rounding up", () => {
    const result = calculateWaybillAmount({
      rawExcelAmount: 50_000n,
      roundMultiple: 50_000n,
      surchargeAmount: 700_000n,
      applySurcharge: true,
    });

    expect(result.roundedAmount).toBe(50_000n);
    expect(result.amount).toBe(750_000n);
  });

  it("handles zero raw amount correctly", () => {
    const result = calculateWaybillAmount({
      rawExcelAmount: 0n,
      applySurcharge: true,
    });

    expect(result.roundedAmount).toBe(0n);
    expect(result.amount).toBe(DEFAULT_SURCHARGE_AMOUNT);
  });

  it("supports omitting surcharge (applySurcharge: false)", () => {
    const result = calculateWaybillAmount({
      rawExcelAmount: 80_686_445n,
      applySurcharge: false,
    });

    expect(result.roundedAmount).toBe(80_700_000n);
    expect(result.surchargeAmount).toBe(0n);
    expect(result.amount).toBe(80_700_000n);
  });

  it("uses default values (50k multiple, 700k surcharge) when options are omitted", () => {
    const result = calculateWaybillAmount({
      rawExcelAmount: 100_001n,
    });

    expect(result.roundedAmount).toBe(150_000n);
    expect(result.surchargeAmount).toBe(DEFAULT_SURCHARGE_AMOUNT);
    expect(result.amount).toBe(150_000n + DEFAULT_SURCHARGE_AMOUNT);
  });

  it("throws error when raw amount is negative", () => {
    expect(() =>
      calculateWaybillAmount({ rawExcelAmount: -100n })
    ).toThrow("AMOUNT_CANNOT_BE_NEGATIVE");
  });

  it("throws error when round multiple is zero or negative", () => {
    expect(() =>
      calculateWaybillAmount({ rawExcelAmount: 1000n, roundMultiple: 0n })
    ).toThrow("INVALID_ROUND_MULTIPLE");

    expect(() =>
      calculateWaybillAmount({ rawExcelAmount: 1000n, roundMultiple: -50_000n })
    ).toThrow("INVALID_ROUND_MULTIPLE");
  });

  it("throws error when surcharge is negative", () => {
    expect(() =>
      calculateWaybillAmount({
        rawExcelAmount: 1000n,
        surchargeAmount: -500n,
        applySurcharge: true,
      })
    ).toThrow("SURCHARGE_CANNOT_BE_NEGATIVE");
  });
});

describe("calculateResidualAmount — Residual calculation rule (business-rules §3 & §7)", () => {
  it("calculates exact difference and NEVER re-rounds the residual", () => {
    const correctedAmount = 85_123_456n;
    const approvedPaymentsTotal = 80_700_000n;

    const residual = calculateResidualAmount(correctedAmount, approvedPaymentsTotal);

    // Exact subtraction, no ceil-round to 50k
    expect(residual).toBe(4_423_456n);
  });

  it("returns zero when payments fully match corrected amount", () => {
    const correctedAmount = 80_000_000n;
    const approvedPaymentsTotal = 80_000_000n;

    const residual = calculateResidualAmount(correctedAmount, approvedPaymentsTotal);
    expect(residual).toBe(0n);
  });

  it("throws OVERPAYMENT_DETECTED when approved payments exceed corrected amount", () => {
    const correctedAmount = 70_000_000n;
    const approvedPaymentsTotal = 80_000_000n;

    expect(() =>
      calculateResidualAmount(correctedAmount, approvedPaymentsTotal)
    ).toThrow("OVERPAYMENT_DETECTED");
  });
});
