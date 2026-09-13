import { normalizeDigits } from "@/lib/utils/digits";
import { AppError } from "@/lib/errors/exceptions";

export const EXCEL_SERIAL_MIN = 30000;
export const EXCEL_SERIAL_MAX = 60000;

/**
 * Converts a Jalali (Solar Hijri) date (year, month, day) to a Gregorian UTC Date.
 * Accurately aligns with the official astronomical Persian calendar.
 */
export function jalaliToUtcDate(jy: number, jm: number, jd: number): Date {
  if (jy < 1300 || jy > 1500) {
    throw new AppError(
      "INVALID_DATE_FORMAT",
      `سال شمسی خارج از بازه مجاز است: ${jy}`
    );
  }
  if (jm < 1 || jm > 12) {
    throw new AppError(
      "INVALID_DATE_FORMAT",
      `ماه شمسی باید بین ۱ تا ۱۲ باشد: ${jm}`
    );
  }
  if (jd < 1 || jd > 31) {
    throw new AppError(
      "INVALID_DATE_FORMAT",
      `روز شمسی باید بین ۱ تا ۳۱ باشد: ${jd}`
    );
  }
  if (jm > 6 && jd > 30) {
    throw new AppError(
      "INVALID_DATE_FORMAT",
      `ماه‌های نیمه دوم سال حداکثر ۳۰ روز دارند: روز ${jd}`
    );
  }

  const formatter = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const dayOfYear = (jm <= 6 ? (jm - 1) * 31 : 6 * 31 + (jm - 7) * 30) + (jd - 1);
  let guess = new Date(Date.UTC(jy + 621, 2, 21 + dayOfYear));

  for (let i = 0; i < 10; i++) {
    const parts = formatter.formatToParts(guess);
    const pYear = parseInt(parts.find((p) => p.type === "year")!.value, 10);
    const pMonth = parseInt(parts.find((p) => p.type === "month")!.value, 10);
    const pDay = parseInt(parts.find((p) => p.type === "day")!.value, 10);

    if (pYear === jy && pMonth === jm && pDay === jd) {
      return guess;
    }

    const pDayOfYear =
      (pMonth <= 6 ? (pMonth - 1) * 31 : 6 * 31 + (pMonth - 7) * 30) + (pDay - 1);
    const diff = (jy - pYear) * 365 + (dayOfYear - pDayOfYear);
    if (diff === 0) {
      guess = new Date(guess.getTime() + (jy > pYear ? 86400000 : -86400000));
    } else {
      guess = new Date(guess.getTime() + diff * 86400000);
    }
  }

  throw new AppError(
    "INVALID_DATE_FORMAT",
    `تاریخ شمسی نامعتبر است (مانند روز ۳۰ اسفند در سال غیرکبیسه): ${jy}/${jm}/${jd}`
  );
}

/**
 * Parses waybill date following business-rules.md §5:
 * 1. Excel serial number in [30000..60000].
 * 2. Jalali date string: YYYY/MM/DD or YYYY.MM.DD or YYYY-MM-DD.
 * 3. Raw numbers outside valid serial range (e.g. 1405) are strictly rejected as INVALID_DATE_FORMAT.
 */
export function parseWaybillDate(input: unknown): Date {
  if (input === null || input === undefined || input === "") {
    throw new AppError("INVALID_DATE_FORMAT", "تاریخ بارنامه نمی‌تواند خالی باشد.");
  }

  // If already a valid JavaScript Date
  if (input instanceof Date && !isNaN(input.getTime())) {
    return input;
  }

  // Priority 1: Number (Excel serial)
  if (typeof input === "number") {
    if (input >= EXCEL_SERIAL_MIN && input <= EXCEL_SERIAL_MAX) {
      // Excel serial to UTC Date (Excel 25569 = 1970-01-01 UTC)
      const millis = Math.round((input - 25569) * 86400 * 1000);
      const d = new Date(millis);
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }

    // Numbers outside [30000..60000] (like 1405) MUST NEVER be guessed as years
    throw new AppError(
      "INVALID_DATE_FORMAT",
      `عدد خام خارج از بازه مجاز سریال اکسل [۳۰۰۰۰..۶۰۰۰۰] است: ${input}`
    );
  }

  // Priority 2: String parsing
  if (typeof input === "string") {
    const raw = normalizeDigits(input).trim();

    // Check if string is purely numeric
    if (/^\d+$/.test(raw)) {
      const num = parseInt(raw, 10);
      if (num >= EXCEL_SERIAL_MIN && num <= EXCEL_SERIAL_MAX) {
        const millis = Math.round((num - 25569) * 86400 * 1000);
        const d = new Date(millis);
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      }
      throw new AppError(
        "INVALID_DATE_FORMAT",
        `عدد خام خارج از بازه مجاز سریال اکسل است: ${raw}`
      );
    }

    // Match Jalali date pattern: YYYY/MM/DD or YYYY.MM.DD or YYYY-MM-DD
    const match = raw.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);

      return jalaliToUtcDate(year, month, day);
    }

    // Also check standard ISO format if Gregorian
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (isoMatch) {
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  throw new AppError(
    "INVALID_DATE_FORMAT",
    `فرمت تاریخ نامعتبر است: ${String(input)}`
  );
}
