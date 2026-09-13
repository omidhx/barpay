import { z } from "zod";

export const MANDATORY_COLUMN_KEYS = [
  "driverName",
  "driverMobile",
  "waybillNumber",
  "payableAmount",
] as const;

export type MandatoryColumnKey = (typeof MANDATORY_COLUMN_KEYS)[number];

export const DEFAULT_COLUMN_NAMES: Record<string, string[]> = {
  driverName: ["نام راننده", "راننده", "نام و نام خانوادگی راننده", "نام راننده / مالک"],
  driverMobile: ["شماره موبایل", "موبایل راننده", "تلفن همراه", "تلفن", "موبایل"],
  waybillNumber: ["شماره بارنامه", "شماره سند", "شماره حواله", "شماره بار"],
  payableAmount: ["جمع پرداختی راننده", "مبلغ پرداختی", "خالص پرداختی", "پرداختی راننده"],
  waybillYear: ["سال", "سال بارنامه"],
  weight: ["وزن", "وزن بارنامه", "وزن ناخالص", "تناژ"],
  issueDate: ["تاریخ", "تاریخ صدور", "تاریخ بارنامه"],
  origin: ["مبدأ", "مبدا", "شهر مبدا"],
  destination: ["مقصد", "شهر مقصد"],
  grossAmount: ["کرایه ناخالص", "مبلغ کل", "کرایه"],
  commissionAmount: ["کمیسیون", "پورسانت"],
  deductionsAmount: ["کسورات", "سایر کسورات"],
  netAmount: ["کرایه خالص", "مبلغ خالص"],
};

export const NormalizedRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  driverName: z.string().min(1, "نام راننده نمی‌تواند خالی باشد"),
  driverMobile: z.string().regex(/^09\d{9}$/, "شماره موبایل باید ۱۱ رقم با پیش‌شماره ۰۹ باشد"),
  waybillNumber: z.string().min(1, "شماره بارنامه نمی‌تواند خالی باشد"),
  waybillYear: z.number().int().nullable().optional(),
  rawExcelAmount: z.bigint().nonnegative("مبلغ خام اکسل نمی‌تواند منفی باشد"),
  payableAmount: z.bigint().nonnegative("مبلغ پرداختی راننده نمی‌تواند منفی باشد"),
  weight: z.number().nonnegative().default(0),
  issueDate: z.date(),
  origin: z.string().nullable().optional(),
  destination: z.string().nullable().optional(),
  grossAmount: z.bigint().nullable().optional(),
  commissionAmount: z.bigint().nullable().optional(),
  deductionsAmount: z.bigint().nullable().optional(),
  netAmount: z.bigint().nullable().optional(),
  isSkippedPreviouslyCancelled: z.boolean().default(false),
});

export type NormalizedRow = z.infer<typeof NormalizedRowSchema>;

export interface ParsedRowResult {
  rowNumber: number;
  rawData: Record<string, unknown>;
  normalizedData?: NormalizedRow;
  status: "VALID" | "INVALID" | "SKIPPED_PREVIOUSLY_CANCELLED";
  errors?: string[];
}
