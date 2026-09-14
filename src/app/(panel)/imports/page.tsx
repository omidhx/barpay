"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  FileSpreadsheet,
  Upload,
  AlertCircle,
  RefreshCw,
  FileCheck,
  CheckCircle2,
} from "lucide-react";

interface NormalizedData {
  rowNumber: number;
  driverName: string;
  driverMobile: string;
  waybillNumber: string;
  rawExcelAmount: string;
  payableAmount: string;
  weight: number;
  issueDate: string;
  origin?: string | null;
  destination?: string | null;
}

interface ParsedSampleRow {
  rowNumber: number;
  status: "VALID" | "INVALID" | "SKIPPED_ZERO_ZERO";
  normalizedData: NormalizedData | null;
  errors?: string[];
}

interface ImportPreview {
  batchId: string;
  filename: string;
  fileHash: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  skippedRows: number;
  sampleRows: ParsedSampleRow[];
}

interface ImportBatchItem {
  id: string;
  filename: string;
  status: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  skippedRows: number;
  createdAt: string;
}

export default function ImportsPage() {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [committing, setCommitting] = useState(false);
  const [recentBatches, setRecentBatches] = useState<ImportBatchItem[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadBatches() {
    try {
      const res = await fetch("/api/panel/imports");
      if (res.ok) {
        const json = await res.json();
        if (json.ok) setRecentBatches(json.data || []);
      }
    } catch {
      // Silently ignore
    }
  }

  useEffect(() => {
    loadBatches();
  }, []);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) {
      await uploadAndProcessFile(selected);
    }
  }

  async function uploadAndProcessFile(f: File) {
    setUploading(true);
    setPreview(null);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", f);

    try {
      const res = await fetch("/api/panel/imports", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (res.ok && json.ok) {
        setPreview(json.data);
        setMessage({
          type: "success",
          text: `فایل با موفقیت پردازش شد. ${json.data.validRows.toLocaleString("fa-IR")} ردیف معتبر آماده ورود به سامانه است.`,
        });
      } else {
        setMessage({
          type: "error",
          text: json.message || "خطا در اعتبارسنجی فایل اکسل.",
        });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در برقراری ارتباط با سرور." });
    } finally {
      setUploading(false);
    }
  }

  async function handleCommit() {
    if (!preview) return;
    setCommitting(true);

    try {
      const res = await fetch("/api/panel/imports", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: preview.batchId }),
      });

      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage({
          type: "success",
          text: `تعداد ${json.data.createdWaybillsCount.toLocaleString("fa-IR")} بارنامه با موفقیت در پایگاه داده ثبت و لینک دسترسی رانندگان صادر شد.`,
        });
        setPreview(null);
        loadBatches();
      } else {
        setMessage({ type: "error", text: json.message || "خطا در ثبت نهایی بچ." });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    } finally {
      setCommitting(false);
    }
  }

  function formatRials(val: string | undefined): string {
    if (!val) return "۰";
    try {
      return BigInt(val).toLocaleString("fa-IR");
    } catch {
      return val;
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-900">ورود و پردازش فایل اکسل بارنامه‌ها</h1>
        <p className="text-xs text-zinc-500 mt-1">
          بارگذاری فایل‌های اکسل شرکت، تفکیک ردیف‌های صفر/صفر، گرد کردن به مضرب ۵۰٬۰۰۰ ریال و صدور خودکار پرونده‌ها
        </p>
      </div>

      {/* Action Message */}
      {message && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center gap-2 transition-all ${
            message.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          )}
          <span className="leading-relaxed">{message.text}</span>
        </div>
      )}

      {/* Upload Box */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-sm">
          <FileSpreadsheet className="w-6 h-6" />
        </div>

        <div>
          <h2 className="text-sm font-bold text-zinc-900">بارگذاری فایل اکسل بارنامه‌ها</h2>
          <p className="text-xs text-zinc-500 mt-1">
            فرمت‌های مجاز: <span className="font-mono font-medium text-zinc-700">.xlsx, .xls, .csv</span> (پشتیبانی از خطوط فارسی و ستون جمع پرداختی راننده)
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex justify-center">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all hover:scale-[1.02] disabled:opacity-50"
          >
            {uploading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>در حال پردازش و اعتبارسنجی ۱۱ گامی...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>انتخاب و بارگذاری فایل اکسل</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Preview Section */}
      {preview && (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 pb-4">
            <div>
              <h2 className="text-sm font-bold text-zinc-900">
                پیش‌نمایش پردازش: <span className="font-mono text-blue-600">{preview.filename}</span>
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5 font-mono">
                شناسه بچ: {preview.batchId}
              </p>
            </div>

            <button
              onClick={handleCommit}
              disabled={committing || preview.validRows === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-emerald-600/20 transition-all hover:scale-[1.02] disabled:opacity-50"
            >
              <FileCheck className="w-4 h-4" />
              <span>{committing ? "در حال ثبت نهایی بارنامه‌ها..." : "تأیید و صدور قطعی بارنامه‌ها"}</span>
            </button>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
              <div className="text-[11px] text-zinc-500">کل ردیف‌ها</div>
              <div className="text-lg font-bold font-mono text-zinc-900 mt-1">
                {preview.totalRows.toLocaleString("fa-IR")}
              </div>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="text-[11px] text-emerald-700 font-medium">ردیف‌های معتبر (تأیید)</div>
              <div className="text-lg font-bold font-mono text-emerald-800 mt-1">
                {preview.validRows.toLocaleString("fa-IR")}
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="text-[11px] text-amber-700 font-medium">بدون کرایه (پرش خودکار ۰/۰)</div>
              <div className="text-lg font-bold font-mono text-amber-800 mt-1">
                {preview.skippedRows.toLocaleString("fa-IR")}
              </div>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
              <div className="text-[11px] text-rose-700 font-medium">ردیف‌های نامعتبر (خطا)</div>
              <div className="text-lg font-bold font-mono text-rose-800 mt-1">
                {preview.errorRows.toLocaleString("fa-IR")}
              </div>
            </div>
          </div>

          {/* Sample Rows Table */}
          <div>
            <h3 className="text-xs font-bold text-zinc-700 mb-3">نمونه ردیف‌های اعتبارسنجی‌شده فایل:</h3>
            <div className="overflow-x-auto border border-zinc-100 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500">
                  <tr>
                    <th className="py-2.5 px-3">ردیف</th>
                    <th className="py-2.5 px-3">شماره بارنامه</th>
                    <th className="py-2.5 px-3">نام راننده</th>
                    <th className="py-2.5 px-3">موبایل راننده</th>
                    <th className="py-2.5 px-3">مبلغ خام اکسل</th>
                    <th className="py-2.5 px-3">مبلغ نهایی راننده (گردشده)</th>
                    <th className="py-2.5 px-3">وضعیت اعتبارسنجی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {preview.sampleRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50/70">
                      <td className="py-2.5 px-3 font-mono text-zinc-400">{row.rowNumber}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-zinc-900">
                        {row.normalizedData?.waybillNumber || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-800">{row.normalizedData?.driverName || "-"}</td>
                      <td className="py-2.5 px-3 font-mono text-zinc-500">{row.normalizedData?.driverMobile || "-"}</td>
                      <td className="py-2.5 px-3 font-mono text-zinc-600">
                        {formatRials(row.normalizedData?.rawExcelAmount)}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                        {formatRials(row.normalizedData?.payableAmount)}
                      </td>
                      <td className="py-2.5 px-3">
                        {row.status === "VALID" && (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[11px]">
                            معتبر
                          </span>
                        )}
                        {row.status === "SKIPPED_ZERO_ZERO" && (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[11px]">
                            پرش صفر/صفر
                          </span>
                        )}
                        {row.status === "INVALID" && (
                          <span
                            className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[11px]"
                            title={row.errors?.join("، ")}
                          >
                            خطای اعتبارسنجی
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Recent Batches List */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-bold text-zinc-900">فایل‌های اکسل بارگذاری‌شده اخیر</h2>
        <div className="divide-y divide-zinc-100">
          {recentBatches.length > 0 ? (
            recentBatches.map((b) => (
              <div key={b.id} className="py-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-600 flex items-center justify-center">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-900 font-mono">{b.filename}</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      {new Date(b.createdAt).toLocaleDateString("fa-IR")} — {b.validRows.toLocaleString("fa-IR")} بارنامه معتبر
                    </div>
                  </div>
                </div>

                <div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${
                      b.status === "COMMITTED"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {b.status === "COMMITTED" ? "ثبت نهایی شده" : b.status}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="py-6 text-center text-xs text-zinc-400">
              هنوز هیچ فایل اکسلی در سامانه ثبت نگردیده است.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
