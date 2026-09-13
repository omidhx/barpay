import { normalizeDigits } from "./digits";

/**
 * Validates an Iranian IBAN (Sheba) using ISO 7064 / ISO 13616 Mod-97-10 check.
 * Format: 'IR' + 24 numeric digits (26 characters).
 * Physical DB CHECK constraint: iban ~ '^IR[0-9]{24}$' + MOD-97 checksum.
 */
export function isValidIranianIban(iban: string): boolean {
  if (!iban) return false;

  const cleanIban = normalizeDigits(iban).trim().toUpperCase().replace(/\s+/g, "");

  // Must match IR followed by 24 digits
  if (!/^IR\d{24}$/.test(cleanIban)) {
    return false;
  }

  // Move the first 4 characters to the end: cleanIban.slice(4) + cleanIban.slice(0, 4)
  const rearranged = cleanIban.slice(4) + cleanIban.slice(0, 4);

  // Convert letters to numbers: 'I' -> '18', 'R' -> '27'
  let numericString = "";
  for (let i = 0; i < rearranged.length; i++) {
    const char = rearranged[i];
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      // 'A' is 10, 'I' is 18, 'R' is 27, etc.
      numericString += (code - 55).toString();
    } else {
      numericString += char;
    }
  }

  // BigInt modulo 97
  try {
    const remainder = BigInt(numericString) % 97n;
    return remainder === 1n;
  } catch {
    return false;
  }
}

/**
 * Formats an Iranian IBAN into readable 4-digit groups.
 * e.g. "IR12 3456 7890 1234 5678 9012 34"
 */
export function formatIranianIban(iban: string): string {
  const cleanIban = normalizeDigits(iban).trim().toUpperCase().replace(/\s+/g, "");
  if (!/^IR\d{24}$/.test(cleanIban)) return iban;

  const parts = [
    cleanIban.slice(0, 4),
    cleanIban.slice(4, 8),
    cleanIban.slice(8, 12),
    cleanIban.slice(12, 16),
    cleanIban.slice(16, 20),
    cleanIban.slice(20, 24),
    cleanIban.slice(24, 26),
  ];

  return parts.join(" ");
}
