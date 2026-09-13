import * as XLSX from "xlsx";
import { AppError } from "@/lib/errors/exceptions";
import {
  DEFAULT_COLUMN_NAMES,
  MANDATORY_COLUMN_KEYS,
} from "./schema";

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
export const MAX_ROW_COUNT = 5000;

export interface ExcelColumnMappingDefinition {
  driverName?: string | number;
  driverMobile?: string | number;
  waybillNumber?: string | number;
  payableAmount?: string | number;
  waybillYear?: string | number;
  weight?: string | number;
  issueDate?: string | number;
  origin?: string | number;
  destination?: string | number;
  grossAmount?: string | number;
  commissionAmount?: string | number;
  deductionsAmount?: string | number;
  netAmount?: string | number;
}

export interface ParseExcelResult {
  sheetName: string;
  totalRows: number;
  headers: string[];
  columnMapping: Record<string, number>;
  rows: Array<Record<string, unknown>>;
}

/**
 * Validates and parses an uploaded Excel/CSV file buffer.
 * Enforces business-rules.md §5:
 * - Formats: .xlsx, .xls, .csv only (macro formats rejected)
 * - Size <= 15MB, Rows <= 5000
 * - Merged cells rejected
 * - Missing mandatory columns list returned clearly
 */
export function parseExcelBuffer(
  buffer: Buffer,
  filename: string,
  customMapping?: ExcelColumnMappingDefinition
): ParseExcelResult {
  // 1. Validate file extension
  const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : "";

  if (["xlsm", "xlsb"].includes(ext)) {
    throw new AppError(
      "INVALID_FILE_FORMAT",
      "فرمت‌های اکسل ماکرودار (.xlsm / .xlsb) به دلایل امنیتی پذیرفته نمی‌شوند. لطفاً فایل را با پسوند .xlsx یا .xls ذخیره فرمایید."
    );
  }

  if (!["xlsx", "xls", "csv"].includes(ext)) {
    throw new AppError(
      "INVALID_FILE_FORMAT",
      `فرمت فایل نامعتبر است (${ext}). تنها فایل‌های .xlsx، .xls و .csv پشتیبانی می‌شوند.`
    );
  }

  // 2. Validate file size
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new AppError(
      "FILE_TOO_LARGE",
      `حجم فایل (${Math.round(buffer.length / 1024 / 1024)}MB) بیش از سقف مجاز (۱۵MB) است.`
    );
  }

  // 3. Read workbook with SheetJS (handles UTF-8 BOM automatically)
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellFormula: false,
      cellHTML: false,
      raw: true,
      dense: false,
    });
  } catch (err: unknown) {
    throw new AppError(
      "FILE_CORRUPTED",
      `فایل اکسل ارسالی خوانده نشد یا خراب است: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new AppError("EMPTY_FILE", "فایل اکسل هیچ برگه (Sheet) فعالی ندارد.");
  }

  const sheet = workbook.Sheets[sheetName];

  // 4. Reject merged cells in data sheet
  if (sheet["!merges"] && sheet["!merges"].length > 0) {
    throw new AppError(
      "MERGED_CELLS_NOT_ALLOWED",
      "فایل اکسل حاوی سلول‌های ادغام‌شده (Merged Cells) است. لطفاً ساختار جدول را به‌صورت ردیف‌های استاندارد و بدون ادغام سلول ارسال فرمایید."
    );
  }

  // 5. Convert to 2D array of rows
  const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (rawMatrix.length < 2) {
    throw new AppError(
      "EMPTY_FILE",
      "فایل اکسل ارسالی فاقد ردیف داده است (حداقل یک سطر عنوان و یک سطر داده الزامی است)."
    );
  }

  const headerRow = (rawMatrix[0] as unknown[]).map((col) =>
    String(col ?? "").trim()
  );

  // 6. Check row count limit
  const dataRowCount = rawMatrix.length - 1;
  if (dataRowCount > MAX_ROW_COUNT) {
    throw new AppError(
      "ROW_LIMIT_EXCEEDED",
      `تعداد ردیف‌های فایل (${dataRowCount}) بیش از سقف پذیرش (${MAX_ROW_COUNT} ردیف) است.`
    );
  }

  // 7. Resolve column index mapping
  const resolvedMapping: Record<string, number> = {};
  const claimedIndices = new Set<number>();

  // A. Custom mapping first
  if (customMapping) {
    for (const [key, customVal] of Object.entries(customMapping)) {
      if (typeof customVal === "number" && customVal >= 0 && customVal < headerRow.length) {
        resolvedMapping[key] = customVal;
        claimedIndices.add(customVal);
      } else if (typeof customVal === "string") {
        const foundIdx = headerRow.findIndex(
          (h, idx) => !claimedIndices.has(idx) && h.toLowerCase() === customVal.toLowerCase().trim()
        );
        if (foundIdx !== -1) {
          resolvedMapping[key] = foundIdx;
          claimedIndices.add(foundIdx);
        }
      }
    }
  }

  const allKeys = Object.keys(DEFAULT_COLUMN_NAMES);

  // B. Exact match against aliases
  for (const key of allKeys) {
    if (resolvedMapping[key] !== undefined) continue;
    const aliases = DEFAULT_COLUMN_NAMES[key] || [];
    const foundIdx = headerRow.findIndex(
      (h, idx) =>
        !claimedIndices.has(idx) &&
        aliases.some((alias) => h.toLowerCase() === alias.toLowerCase())
    );
    if (foundIdx !== -1) {
      resolvedMapping[key] = foundIdx;
      claimedIndices.add(foundIdx);
    }
  }

  // C. Substring match against aliases (longer aliases take priority, e.g. "جمع پرداختی راننده" before "راننده")
  const candidatePairs: Array<{ key: string; alias: string }> = [];
  for (const key of allKeys) {
    if (resolvedMapping[key] !== undefined) continue;
    const aliases = DEFAULT_COLUMN_NAMES[key] || [];
    for (const alias of aliases) {
      candidatePairs.push({ key, alias });
    }
  }
  candidatePairs.sort((a, b) => b.alias.length - a.alias.length);

  for (const { key, alias } of candidatePairs) {
    if (resolvedMapping[key] !== undefined) continue;
    const foundIdx = headerRow.findIndex(
      (h, idx) =>
        !claimedIndices.has(idx) &&
        h.toLowerCase().includes(alias.toLowerCase())
    );
    if (foundIdx !== -1) {
      resolvedMapping[key] = foundIdx;
      claimedIndices.add(foundIdx);
    }
  }

  // 8. Validate mandatory columns presence
  const missingMandatory: string[] = [];
  for (const mandatoryKey of MANDATORY_COLUMN_KEYS) {
    if (resolvedMapping[mandatoryKey] === undefined) {
      const primaryTitle = DEFAULT_COLUMN_NAMES[mandatoryKey]?.[0] || mandatoryKey;
      missingMandatory.push(primaryTitle);
    }
  }

  if (missingMandatory.length > 0) {
    throw new AppError(
      "MISSING_MANDATORY_COLUMNS",
      `این فایل فاقد ستون‌های لازم است: ${missingMandatory.join("، ")}`
    );
  }

  // 9. Map data rows
  const rows: Array<Record<string, unknown>> = [];

  for (let r = 1; r < rawMatrix.length; r++) {
    const rowValues = rawMatrix[r] as unknown[];
    // Skip completely empty rows
    if (!rowValues || rowValues.every((v) => v === "" || v === null || v === undefined)) {
      continue;
    }

    const rowObj: Record<string, unknown> = {
      __rowNumber: r + 1, // 1-indexed for user display
    };

    for (const [fieldKey, colIdx] of Object.entries(resolvedMapping)) {
      rowObj[fieldKey] = rowValues[colIdx] ?? "";
    }

    rows.push(rowObj);
  }

  return {
    sheetName,
    totalRows: rows.length,
    headers: headerRow,
    columnMapping: resolvedMapping,
    rows,
  };
}
