/**
 * Utility for normalizing Persian (fa) and Arabic (ar) digits to standard Latin ASCII digits.
 * Used for all numeric inputs (phone numbers, amounts, OTP, tracking codes, IBAN).
 */
export function normalizeDigits(input: string | null | undefined): string {
  if (!input) return "";

  return input
    .replace(/[۰-۹]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 1776 + 48))
    .replace(/[٠-٩]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 1632 + 48));
}

/**
 * Normalizes Iranian mobile phone numbers to standard 11-digit format: 09xxxxxxxxx
 * Accepts variants like +98912..., 0098912..., 98912..., 912...
 * Returns null if invalid.
 */
export function normalizeMobile(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = normalizeDigits(input).replace(/\D/g, "");

  if (digits.startsWith("0098") && digits.length === 14) {
    const local = "0" + digits.slice(4);
    return isValidIranianMobile(local) ? local : null;
  }
  if (digits.startsWith("98") && digits.length === 12) {
    const local = "0" + digits.slice(2);
    return isValidIranianMobile(local) ? local : null;
  }
  if (digits.startsWith("9") && digits.length === 10) {
    const local = "0" + digits;
    return isValidIranianMobile(local) ? local : null;
  }
  if (digits.startsWith("09") && digits.length === 11) {
    return isValidIranianMobile(digits) ? digits : null;
  }

  return null;
}

function isValidIranianMobile(mobile: string): boolean {
  return /^09[0-9]{9}$/.test(mobile);
}

/**
 * Masks Iranian mobile number for logs and public displays: 0912***1234
 */
export function maskMobile(mobile: string | null | undefined): string {
  if (!mobile) return "";
  const clean = normalizeDigits(mobile).replace(/\D/g, "");
  if (clean.length < 11) return clean;
  return `${clean.slice(0, 4)}***${clean.slice(7)}`;
}

