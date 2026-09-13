import { normalizeDigits } from "./digits";

/**
 * Validates a 16-digit Iranian bank card number using Luhn algorithm (Mod-10).
 * Matches check constraint: card_number ~ '^[0-9]{16}$' + Luhn checksum.
 */
export function isValidCardNumber(cardNumber: string): boolean {
  const digits = normalizeDigits(cardNumber).replace(/\D/g, "");

  if (digits.length !== 16) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let digit = parseInt(digits.charAt(i), 10);
    // Double every second digit from the right (even index in 0-indexed 16-digit string)
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
  }

  return sum % 10 === 0;
}

export interface BankInfo {
  code: string;
  name: string;
  bin: string;
}

export const IRANIAN_BANKS_BIN: Record<string, { code: string; name: string }> = {
  "603799": { code: "BMI", name: "بانک ملی ایران" },
  "589210": { code: "SEP", name: "بانک سپه" },
  "627648": { code: "EDBI", name: "بانک توسعه صادرات" },
  "627961": { code: "BIM", name: "بانک صنعت و معدن" },
  "603770": { code: "BKI", name: "بانک کشاورزی" },
  "628023": { code: "MASKAN", name: "بانک مسکن" },
  "627760": { code: "POST", name: "پست بانک ایران" },
  "502908": { code: "TT", name: "بانک توسعه تعاون" },
  "627412": { code: "EN", name: "بانک اقتصاد نوین" },
  "622106": { code: "PARSIAN", name: "بانک پارسیان" },
  "502229": { code: "PASARGAD", name: "بانک پاسارگاد" },
  "627488": { code: "KARAFARIN", name: "بانک کارآفرین" },
  "621986": { code: "SAMAN", name: "بانک سامان" },
  "639346": { code: "SINA", name: "بانک سینا" },
  "639607": { code: "SARMAYEH", name: "بانک سرمایه" },
  "636214": { code: "AYANDEH", name: "بانک آینده" },
  "502806": { code: "SHAHR", name: "بانک شهر" },
  "502938": { code: "DEY", name: "بانک دی" },
  "606373": { code: "MEHR", name: "بانک قرض‌الحسنه مهر ایران" },
  "610433": { code: "BPM", name: "بانک ملت" },
  "627353": { code: "TEJARAT", name: "بانک تجارت" },
  "585983": { code: "TEJARAT", name: "بانک تجارت" },
  "627381": { code: "ANSAR", name: "بانک انصار / سپه" },
  "505416": { code: "GARDESHGARI", name: "بانک گردشگری" },
  "639599": { code: "GHAVAMIN", name: "بانک قوامین / سپه" },
  "504172": { code: "RESALAT", name: "بانک قرض‌الحسنه رسالت" },
  "636795": { code: "MARKAZI", name: "بانک مرکزی" },
};

/**
 * Detects bank from the 6-digit BIN prefix.
 */
export function getBankInfoFromCard(cardNumber: string): BankInfo {
  const digits = normalizeDigits(cardNumber).replace(/\D/g, "");
  const bin = digits.slice(0, 6);
  const info = IRANIAN_BANKS_BIN[bin];

  if (info) {
    return { ...info, bin };
  }

  return {
    code: "OTHER",
    name: "بانک نامشخص",
    bin,
  };
}

/**
 * Formats a 16-digit card number into 4-4-4-4 format.
 */
export function formatCardNumber(cardNumber: string, separator: string = " - "): string {
  const digits = normalizeDigits(cardNumber).replace(/\D/g, "");
  if (digits.length !== 16) return cardNumber;
  return `${digits.slice(0, 4)}${separator}${digits.slice(4, 8)}${separator}${digits.slice(8, 12)}${separator}${digits.slice(12, 16)}`;
}
