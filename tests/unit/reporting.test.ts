import { describe, it, expect } from "vitest";
import {
  sanitizeCsvCell,
  generateSafeCsv,
} from "@/modules/reports/reporting-service";
import { mapErrorToPersianReason } from "@/modules/notifications/sms-monitoring-service";
import { calculateWaybillAmount } from "@/lib/waybills/amount";

describe("Phase 6 — Reporting & CSV Formula Injection Sanitization", () => {
  it("sanitizes CSV cells against formula injection (starts with =, +, -, @)", () => {
    // Dangerous spreadsheet formula attempts
    expect(sanitizeCsvCell("=1+1")).toBe("'=1+1");
    expect(sanitizeCsvCell("=cmd|'/C calc'!A0")).toBe("'=cmd|'/C calc'!A0");
    expect(sanitizeCsvCell("+234567")).toBe("'+234567");
    expect(sanitizeCsvCell("-1000000")).toBe("'-1000000");
    expect(sanitizeCsvCell("@SUM(A1:A10)")).toBe("'@SUM(A1:A10)");

    // Safe regular values
    expect(sanitizeCsvCell("علی محمدی")).toBe("علی محمدی");
    expect(sanitizeCsvCell("14030101")).toBe("14030101");
    expect(sanitizeCsvCell(BigInt(80700000))).toBe("80700000");
    expect(sanitizeCsvCell(null)).toBe("");
    expect(sanitizeCsvCell(undefined)).toBe("");

    // Escape quotes and commas
    expect(sanitizeCsvCell('تهران, بلوار "آزادی"')).toBe('"تهران, بلوار ""آزادی"""');
  });

  it("prepends UTF-8 BOM to CSV content for native Persian Excel compatibility", () => {
    const headers = ["شماره بارنامه", "مبلغ (ریال)"];
    const rows = [
      ["123456", BigInt(50000)],
      ["=789", BigInt(100000)],
    ];

    const csv = generateSafeCsv(headers, rows);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("شماره بارنامه,مبلغ (ریال)");
    expect(csv).toContain("123456,50000");
    expect(csv).toContain("'=789,100000");
  });
});

describe("Phase 6 — SMS Error Persian Translation (master-spec §11.1)", () => {
  it("translates phone unreachable / power off errors to Persian", () => {
    const reason1 = mapErrorToPersianReason("Driver phone is power off or unreachable");
    expect(reason1).toContain("خاموش یا خارج از دسترس");

    const reason2 = mapErrorToPersianReason("گوشی راننده خاموش است");
    expect(reason2).toContain("خاموش یا خارج از دسترس");
  });

  it("translates invalid mobile number errors", () => {
    const reason = mapErrorToPersianReason("Invalid mobile number format");
    expect(reason).toContain("شماره تلفن همراه راننده نامعتبر است");
  });

  it("translates blacklist / blocked advertising numbers", () => {
    const reason = mapErrorToPersianReason("Recipient on telecom blacklist");
    expect(reason).toContain("لیست سیاه");
  });

  it("translates daily cap exceeded error", () => {
    const reason = mapErrorToPersianReason("SMS_DAILY_CAP_EXCEEDED");
    expect(reason).toContain("سقف مجاز ارسال روزانه");
  });

  it("translates connection and timeout errors", () => {
    const reason1 = mapErrorToPersianReason("Fetch network ECONNREFUSED");
    expect(reason1).toContain("ارتباط شبکه");

    const reason2 = mapErrorToPersianReason("Request timed out after 10000ms");
    expect(reason2).toContain("مهلت زمانی");
  });
});

describe("Phase 6 — Cumulative Rounding Excess Financial Logic", () => {
  it("calculates exact rounding excess for business golden examples", () => {
    const roundMultiple = BigInt(50000);

    // Official Example 1: 80,686,445 -> 80,700,000
    const raw1 = BigInt(80686445);
    const rounded1 = calculateWaybillAmount({
      rawExcelAmount: raw1,
      roundMultiple,
      surchargeAmount: 0n,
      applySurcharge: false,
    }).roundedAmount;
    expect(rounded1).toBe(BigInt(80700000));
    const excess1 = rounded1 - raw1;
    expect(excess1).toBe(BigInt(13555));

    // Official Example 2: 13,712,500 -> 13,750,000
    const raw2 = BigInt(13712500);
    const rounded2 = calculateWaybillAmount({
      rawExcelAmount: raw2,
      roundMultiple,
      surchargeAmount: 0n,
      applySurcharge: false,
    }).roundedAmount;
    expect(rounded2).toBe(BigInt(13750000));
    const excess2 = rounded2 - raw2;
    expect(excess2).toBe(BigInt(37500));

    // Combined cumulative excess
    const totalRaw = raw1 + raw2;
    const totalRounded = rounded1 + rounded2;
    const cumulativeExcess = totalRounded - totalRaw;
    expect(cumulativeExcess).toBe(excess1 + excess2);
    expect(cumulativeExcess).toBe(BigInt(51055));
  });
});
