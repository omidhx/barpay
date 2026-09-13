import { describe, it, expect } from "vitest";
import { parseWaybillDate, jalaliToUtcDate } from "@/lib/waybills/date-parser";
import { AppError } from "@/lib/errors/exceptions";

describe("parseWaybillDate — Table-driven Date parsing (business-rules.md §5 & testing.md)", () => {
  it("parses valid Excel serial numbers in range [30000..60000]", () => {
    // 45000 -> 2023-03-15
    const d1 = parseWaybillDate(45000);
    expect(d1.getUTCFullYear()).toBe(2023);
    expect(d1.getUTCMonth()).toBe(2); // March is index 2
    expect(d1.getUTCDate()).toBe(15);

    // Minimum boundary: 30000 -> 1982-02-18
    const dMin = parseWaybillDate(30000);
    expect(dMin.getUTCFullYear()).toBe(1982);

    // Maximum boundary: 60000 -> 2064-04-26
    const dMax = parseWaybillDate(60000);
    expect(dMax.getUTCFullYear()).toBe(2064);

    // Numeric strings representing valid serials
    const dStr = parseWaybillDate("45000");
    expect(dStr.getUTCFullYear()).toBe(2023);
  });

  it("REJECTS raw numbers outside valid serial range [30000..60000] (must never guess as year)", () => {
    expect(() => parseWaybillDate(1405)).toThrowError(AppError);
    expect(() => parseWaybillDate("1405")).toThrowError(AppError);
    expect(() => parseWaybillDate(29999)).toThrowError(AppError);
    expect(() => parseWaybillDate(60001)).toThrowError(AppError);
    expect(() => parseWaybillDate(0)).toThrowError(AppError);
    expect(() => parseWaybillDate(-500)).toThrowError(AppError);
  });

  it("parses Jalali date strings with slash (/), dot (.) and dash (-)", () => {
    const d1 = parseWaybillDate("1405/06/18");
    const d2 = parseWaybillDate("1405.06.18");
    const d3 = parseWaybillDate("1405-06-18");

    // All should yield 2026-09-09 UTC
    expect(d1.toISOString()).toBe("2026-09-09T00:00:00.000Z");
    expect(d2.toISOString()).toBe("2026-09-09T00:00:00.000Z");
    expect(d3.toISOString()).toBe("2026-09-09T00:00:00.000Z");
  });

  it("parses Jalali dates written in Persian and Arabic digits", () => {
    const dFa = parseWaybillDate("۱۴۰۵/۰۶/۱۸");
    const dAr = parseWaybillDate("١٤٠٥/٠٦/١٨");

    expect(dFa.toISOString()).toBe("2026-09-09T00:00:00.000Z");
    expect(dAr.toISOString()).toBe("2026-09-09T00:00:00.000Z");
  });

  it("handles year boundary and leap year transition: 1403/12/30 vs 1404/01/01", () => {
    // 1403 is a leap year (30 Esfand exists) -> 2025-03-20
    const dLeap = parseWaybillDate("1403/12/30");
    expect(dLeap.toISOString()).toBe("2025-03-20T00:00:00.000Z");

    // 1404/01/01 -> 2025-03-21
    const dNewYear = parseWaybillDate("1404/01/01");
    expect(dNewYear.toISOString()).toBe("2025-03-21T00:00:00.000Z");

    // 1404 is NOT a leap year: 1404/12/30 MUST be rejected
    expect(() => parseWaybillDate("1404/12/30")).toThrowError(AppError);
  });

  it("rejects invalid dates, empty strings, null and undefined", () => {
    expect(() => parseWaybillDate("")).toThrow();
    expect(() => parseWaybillDate(null)).toThrow();
    expect(() => parseWaybillDate(undefined)).toThrow();
    expect(() => parseWaybillDate("invalid-date-string")).toThrow();
    expect(() => parseWaybillDate("1403/13/01")).toThrow(); // Month 13
    expect(() => parseWaybillDate("1403/07/31")).toThrow(); // Month 7 has max 30 days
  });
});
