import { createHash } from "crypto";
import { normalizeDigits } from "@/lib/utils/digits";
import { AppError } from "@/lib/errors/exceptions";

export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const PDF_MAGIC_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

// Production Regex: BL[\s-_]*(?<number>[0-9۰-۹]+)(?:[\s-_]+(?<year>\d{2,4}))?
export const WAYBILL_PDF_FILENAME_REGEX =
  /^BL[\s-_]*(?<number>[0-9۰-۹]+)(?:[\s-_]+(?<year>\d{2,4}))?/i;

export interface ExtractedPdfMetadata {
  waybillNumber: string | null;
  waybillYear: number | null;
  sha256Hash: string;
  fileSize: number;
  mimeType: string;
}

/**
 * Validates PDF buffer security (magic bytes, size, embedded JS) and extracts
 * waybill number & optional year from filename according to business-rules.md §6 & master-spec §6.2.
 */
export function parseAndValidatePdf(
  buffer: Buffer,
  filename: string
): ExtractedPdfMetadata {
  // 1. File size check
  if (buffer.length > MAX_PDF_SIZE_BYTES) {
    throw new AppError(
      "FILE_TOO_LARGE",
      `حجم فایل PDF (${(buffer.length / 1024 / 1024).toFixed(1)}MB) بیش از سقف مجاز (۱۰MB) است.`
    );
  }

  if (buffer.length < 5) {
    throw new AppError("EMPTY_FILE", "فایل ارسالی خالی یا ناقص است.");
  }

  // 2. Magic bytes check (%PDF-)
  const header = buffer.subarray(0, 5);
  if (!header.equals(PDF_MAGIC_BYTES)) {
    throw new AppError(
      "INVALID_FILE_FORMAT",
      "فرمت فایل نامعتبر است. محتوای فایل ارسالی با امضای استاندارد اسناد PDF تطابق ندارد."
    );
  }

  // 3. Security check: embedded JavaScript check (master-doc v2.2 PDF_EMBEDDED_JS_DISABLED)
  // Check ASCII/raw stream for /JavaScript or /JS tokens
  const bufferString = buffer.toString("latin1");
  if (/\/JavaScript\b/i.test(bufferString) || /\/JS\s*[\(\<]/i.test(bufferString)) {
    throw new AppError(
      "PDF_EMBEDDED_JS_DISABLED",
      "فایل‌های PDF حاوی اسکریپت یا کدهای اجرایی تعبیه‌شده (JavaScript) به دلایل امنیتی مسدود می‌باشند."
    );
  }

  // 4. Compute SHA-256 hash
  const sha256Hash = createHash("sha256").update(buffer).digest("hex");

  // 5. Extract waybill number and optional year from filename
  // Clean filename: remove extension and trim
  const cleanBaseName = filename.replace(/\.pdf$/i, "").trim();
  const match = WAYBILL_PDF_FILENAME_REGEX.exec(cleanBaseName);

  let waybillNumber: string | null = null;
  let waybillYear: number | null = null;

  if (match && match.groups?.number) {
    waybillNumber = normalizeDigits(match.groups.number);
    if (match.groups.year) {
      waybillYear = parseInt(normalizeDigits(match.groups.year), 10);
    }
  }

  return {
    waybillNumber,
    waybillYear,
    sha256Hash,
    fileSize: buffer.length,
    mimeType: "application/pdf",
  };
}
