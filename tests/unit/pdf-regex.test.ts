import { describe, it, expect } from "vitest";
import {
  parseAndValidatePdf,
  PDF_MAGIC_BYTES,
  MAX_PDF_SIZE_BYTES,
} from "@/modules/documents/pdf-parser";
import { AppError } from "@/lib/errors/exceptions";

function createMockPdfBuffer(content: string = "Standard PDF content"): Buffer {
  return Buffer.concat([PDF_MAGIC_BYTES, Buffer.from(`1.4\n${content}\n%%EOF`)]);
}

describe("PDF Parser & Filename Regex (business-rules.md §6 & master-spec §6.2)", () => {
  it("extracts simple waybill number: BL123456.pdf", () => {
    const buffer = createMockPdfBuffer();
    const result = parseAndValidatePdf(buffer, "BL123456.pdf");
    expect(result.waybillNumber).toBe("123456");
    expect(result.waybillYear).toBeNull();
  });

  it("extracts waybill number with hyphen and year: BL-8605186-1402-91.pdf", () => {
    const buffer = createMockPdfBuffer();
    const result = parseAndValidatePdf(buffer, "BL-8605186-1402-91.pdf");
    expect(result.waybillNumber).toBe("8605186");
    expect(result.waybillYear).toBe(1402);
  });

  it("extracts with spaces and underscores: BL _ 98765 _ 1403.pdf", () => {
    const buffer = createMockPdfBuffer();
    const result = parseAndValidatePdf(buffer, "BL _ 98765 _ 1403.pdf");
    expect(result.waybillNumber).toBe("98765");
    expect(result.waybillYear).toBe(1403);
  });

  it("normalizes Persian digits: BL_۱۲۳۴۵۶.pdf", () => {
    const buffer = createMockPdfBuffer();
    const result = parseAndValidatePdf(buffer, "BL_۱۲۳۴۵۶.pdf");
    expect(result.waybillNumber).toBe("123456");
    expect(result.waybillYear).toBeNull();
  });

  it("returns null for non-matching filename: invoice_2024.pdf", () => {
    const buffer = createMockPdfBuffer();
    const result = parseAndValidatePdf(buffer, "invoice_2024.pdf");
    expect(result.waybillNumber).toBeNull();
    expect(result.waybillYear).toBeNull();
  });

  it("rejects non-PDF files lacking magic bytes", () => {
    const invalidBuffer = Buffer.from("PK\x03\x04This is a zip file");
    expect(() => parseAndValidatePdf(invalidBuffer, "BL123456.pdf")).toThrowError(AppError);
    try {
      parseAndValidatePdf(invalidBuffer, "BL123456.pdf");
    } catch (err: unknown) {
      expect((err as AppError).code).toBe("INVALID_FILE_FORMAT");
    }
  });

  it("rejects PDF containing embedded JavaScript (PDF_EMBEDDED_JS_DISABLED)", () => {
    const jsPdfBuffer = createMockPdfBuffer(
      "/Type /Action /S /JavaScript /JS (app.alert('hello'))"
    );
    expect(() => parseAndValidatePdf(jsPdfBuffer, "BL123456.pdf")).toThrowError(AppError);
    try {
      parseAndValidatePdf(jsPdfBuffer, "BL123456.pdf");
    } catch (err: unknown) {
      expect((err as AppError).code).toBe("PDF_EMBEDDED_JS_DISABLED");
    }
  });

  it("computes deterministic SHA-256 hash", () => {
    const buffer = createMockPdfBuffer("Fixed hash content");
    const res1 = parseAndValidatePdf(buffer, "BL1001.pdf");
    const res2 = parseAndValidatePdf(buffer, "BL1002.pdf");
    expect(res1.sha256Hash).toBe(res2.sha256Hash);
    expect(res1.sha256Hash.length).toBe(64);
  });
});
