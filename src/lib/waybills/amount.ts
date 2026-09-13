/**
 * Payable Amount calculation chain for barnameh-pay.
 * Follows business-rules.md §3 and master-spec §4.2.
 * 
 * Money is ALWAYS BIGINT Rials. Never float or JS number.
 */

export interface AmountCalculationInput {
  rawExcelAmount: bigint;
  roundMultiple?: bigint; // Default: 50,000 IRR
  surchargeAmount?: bigint; // Default: 700,000 IRR if applied
  applySurcharge?: boolean; // Default: true
}

export interface WaybillAmountResult {
  rawExcelAmount: bigint;
  roundedAmount: bigint;
  surchargeAmount: bigint;
  amount: bigint; // Final payable amount
}

export const DEFAULT_ROUND_MULTIPLE = 50_000n;
export const DEFAULT_SURCHARGE_AMOUNT = 700_000n;

/**
 * Calculates the final payable waybill amount following the mandatory rounding chain:
 * 1. Raw Excel amount (must be non-negative integer Rials).
 * 2. Ceil-round to organization multiple (default: 50,000 IRR).
 * 3. Add optional surcharge (default: 700,000 IRR).
 * 4. Stored with full breakdown.
 */
export function calculateWaybillAmount(input: AmountCalculationInput): WaybillAmountResult {
  const {
    rawExcelAmount,
    roundMultiple = DEFAULT_ROUND_MULTIPLE,
    surchargeAmount = DEFAULT_SURCHARGE_AMOUNT,
    applySurcharge = true,
  } = input;

  if (rawExcelAmount < 0n) {
    throw new Error("AMOUNT_CANNOT_BE_NEGATIVE: مبلغ اکسل نمی‌تواند منفی باشد.");
  }
  if (roundMultiple <= 0n) {
    throw new Error("INVALID_ROUND_MULTIPLE: مضرب گرد کردن باید عددی مثبت و بزرگتر از صفر باشد.");
  }

  // Step 2: Ceil-round to multiple
  let roundedAmount: bigint;
  const remainder = rawExcelAmount % roundMultiple;
  if (remainder === 0n) {
    roundedAmount = rawExcelAmount;
  } else {
    roundedAmount = rawExcelAmount + (roundMultiple - remainder);
  }

  // Step 3: Add optional surcharge
  const effectiveSurcharge = applySurcharge ? surchargeAmount : 0n;
  if (effectiveSurcharge < 0n) {
    throw new Error("SURCHARGE_CANNOT_BE_NEGATIVE: مبلغ افزودنی نمی‌تواند منفی باشد.");
  }

  const finalAmount = roundedAmount + effectiveSurcharge;

  return {
    rawExcelAmount,
    roundedAmount,
    surchargeAmount: effectiveSurcharge,
    amount: finalAmount,
  };
}

/**
 * Calculates residual amount after operator correction.
 * RULE: Residual amount is NEVER re-rounded!
 * It is strictly the difference between corrected amount and sum of approved payments.
 */
export function calculateResidualAmount(
  correctedAmount: bigint,
  approvedPaymentsTotal: bigint
): bigint {
  if (correctedAmount < approvedPaymentsTotal) {
    throw new Error("OVERPAYMENT_DETECTED: مجموع پرداختی‌های تأییدشده بیشتر از مبلغ اصلاح‌شده است.");
  }
  return correctedAmount - approvedPaymentsTotal;
}
