"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  Upload,
  CheckCircle,
  RefreshCw,
  Link as LinkIcon,
  AlertCircle,
  FileCheck2,
} from "lucide-react";

interface DocumentItem {
  id: string;
  storageKey: string;
  fileSize: number;
  extractedWaybillNumber: string | null;
  matchingStatus: string;
  matchingMethod: string | null;
  createdAt: string;
  waybill?: {
    id: string;
    waybillNumber: string;
    driverNameRaw: string;
    driverMobileRaw: string;
    shipmentStatus: string;
  } | null;
}

interface MatchResult {
  total: number;
  matchedCount: number;
  unmatchedCount: number;
  results: Array<{
    filename: string;
    documentId?: string;
    waybillId?: string | null;
    waybillNumber?: string | null;
    outcome: string;
    message: string;
  }>;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<MatchResult | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [manualAttachDoc, setManualAttachDoc] = useState<DocumentItem | null>(null);
  const [targetWaybillId, setTargetWaybillId] = useState("");
  const [attaching, setAttaching] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadDocuments() {
    setLoading(true);
    try {
      const res = await fetch("/api/panel/documents");
      if (res.ok) {
        const json = await res.json();
        if (json.ok) setDocuments(json.data || []);
      }
    } catch {
      // Silently ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadResult(null);
    setMessage(null);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const res = await fetch("/api/panel/documents", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (res.ok && json.ok) {
        setUploadResult(json.data);
        setMessage({
          type: "success",
          text: `پردازش اسناد به اتمام رسید. ${json.data.matchedCount.toLocaleString("fa-IR")} سند تطبیق خودکار داده شد.`,
        });
        loadDocuments();
      } else {
        setMessage({ type: "error", text: json.message || "خطا در بارگذاری اسناد PDF." });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در برقراری ارتباط با سرور." });
    } finally {
      setUploading(false);
    }
  }

  async function handleManualAttachSubmit() {
    if (!manualAttachDoc || !targetWaybillId) return;
    setAttaching(true);

    try {
      const res = await fetch("/api/panel/documents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: manualAttachDoc.id,
          waybillId: targetWaybillId,
        }),
      });

      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage({ type: "success", text: "سند با موفقیت به بارنامه متصل گردید." });
        setManualAttachDoc(null);
        setTargetWaybillId("");
        loadDocuments();
      } else {
        setMessage({ type: "error", text: json.message || "خطا در اتصال دستی سند." });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    } finally {
      setAttaching(false);
    }
  }

  function formatBytes(bytes: number): string {
    if (!bytes) return "۰ بایت";
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb).toLocaleString("fa-IR")} کیلوبایت`;
    return `${(kb / 1024).toFixed(1)} مگابایت`;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">بارگذاری و تطبیق اسناد PDF بارنامه</h1>
          <p className="text-xs text-zinc-500 mt-1">
            موتور تطبیق ۱:۱، استخراج خودکار شماره بارنامه از فایل‌های PDF، اعتبارسنجی امنیتی و اتصال دستی
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadDocuments}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-xl hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>بروزرسانی</span>
          </button>
        </div>
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
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Upload PDF Box */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-sm">
          <FileText className="w-6 h-6" />
        </div>

        <div>
          <h2 className="text-sm font-bold text-zinc-900">بارگذاری دسته‌ای اسناد PDF بارنامه‌ها</h2>
          <p className="text-xs text-zinc-500 mt-1">
            سامانه به صورت خودکار شماره بارنامه را از نام فایل یا محتوای مدرک استخراج کرده و به پرونده منطبق متصل می‌کند.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf"
          onChange={handleFileUpload}
          className="hidden"
        />

        <div className="flex justify-center">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all hover:scale-[1.02] disabled:opacity-50"
          >
            {uploading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>در حال تحلیل و تطبیق ۱:۱ اسناد PDF...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>انتخاب فایل‌های PDF بارنامه (تکی یا گروهی)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Batch Upload Match Results */}
      {uploadResult && (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 space-y-3">
          <h3 className="text-xs font-bold text-zinc-900 flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-emerald-600" />
            <span>نتیجه تطبیق فایل‌های بارگذاری‌شده:</span>
          </h3>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
              <div className="text-[11px] text-zinc-500">کل فایل‌ها</div>
              <div className="text-base font-bold font-mono text-zinc-900 mt-0.5">
                {uploadResult.total.toLocaleString("fa-IR")}
              </div>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <div className="text-[11px] text-emerald-700 font-medium">تطبیق خودکار موفق</div>
              <div className="text-base font-bold font-mono text-emerald-800 mt-0.5">
                {uploadResult.matchedCount.toLocaleString("fa-IR")}
              </div>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
              <div className="text-[11px] text-amber-700 font-medium">نیازمند تطبیق دستی</div>
              <div className="text-base font-bold font-mono text-amber-800 mt-0.5">
                {uploadResult.unmatchedCount.toLocaleString("fa-IR")}
              </div>
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            {uploadResult.results.map((r, i) => (
              <div
                key={i}
                className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                  r.outcome === "MATCHED"
                    ? "bg-emerald-50/60 border-emerald-200 text-emerald-900"
                    : "bg-amber-50/60 border-amber-200 text-amber-900"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium">{r.filename}</span>
                  <span className="text-[11px] text-zinc-500">({r.message})</span>
                </div>
                <span className="px-2 py-0.5 bg-white rounded text-[10px] font-semibold border">
                  {r.outcome === "MATCHED" ? "متصل شد" : "نیاز به بررسی"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents List */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
          <h2 className="text-xs font-bold text-zinc-900">فهرست اسناد PDF ذخیره‌شده در سیستم</h2>
          <span className="text-xs text-zinc-400 font-mono">{documents.length.toLocaleString("fa-IR")} سند</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500">
              <tr>
                <th className="py-3 px-4 font-semibold">شماره بارنامه استخراجی</th>
                <th className="py-3 px-4 font-semibold">بارنامه متصل در سیستم</th>
                <th className="py-3 px-4 font-semibold">وضعیت تطبیق</th>
                <th className="py-3 px-4 font-semibold">روش تطبیق</th>
                <th className="py-3 px-4 font-semibold">حجم فایل</th>
                <th className="py-3 px-4 font-semibold">تاریخ بارگذاری</th>
                <th className="py-3 px-4 font-semibold text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {documents.length > 0 ? (
                documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-zinc-900">
                      {doc.extractedWaybillNumber || "-"}
                    </td>
                    <td className="py-3 px-4">
                      {doc.waybill ? (
                        <div>
                          <div className="font-semibold text-zinc-900 font-mono">{doc.waybill.waybillNumber}</div>
                          <div className="text-[10px] text-zinc-400">{doc.waybill.driverNameRaw}</div>
                        </div>
                      ) : (
                        <span className="text-amber-600 font-medium">فاقد اتصال</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {doc.matchingStatus === "AUTO_MATCHED" && (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[11px] font-medium">
                          تطبیق خودکار
                        </span>
                      )}
                      {doc.matchingStatus === "MANUALLY_ATTACHED" && (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[11px] font-medium">
                          اتصال دستی
                        </span>
                      )}
                      {doc.matchingStatus === "UNMATCHED" && (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[11px] font-medium">
                          تطبیق‌نیافته
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-zinc-500 font-mono text-[11px]">
                      {doc.matchingMethod || "نامشخص"}
                    </td>
                    <td className="py-3 px-4 font-mono text-zinc-500">
                      {formatBytes(doc.fileSize)}
                    </td>
                    <td className="py-3 px-4 text-zinc-400 font-mono text-[11px]">
                      {new Date(doc.createdAt).toLocaleDateString("fa-IR")}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {!doc.waybill && (
                        <button
                          onClick={() => {
                            setManualAttachDoc(doc);
                            setTargetWaybillId("");
                          }}
                          className="px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 mx-auto"
                        >
                          <LinkIcon className="w-3 h-3" />
                          <span>اتصال دستی</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-zinc-400">
                    هیچ سند PDF بارگذاری نشده است.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Attach Modal */}
      {manualAttachDoc && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-zinc-200 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="font-bold text-sm text-zinc-900">اتصال دستی سند به بارنامه</h3>
              <button
                onClick={() => setManualAttachDoc(null)}
                className="text-zinc-400 hover:text-zinc-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-600 mb-1">شماره بارنامه پیشنهادی سند:</label>
                <div className="font-mono text-zinc-900 font-bold bg-zinc-50 p-2 rounded-lg border">
                  {manualAttachDoc.extractedWaybillNumber || "استخراج نشد"}
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 font-medium mb-1">شناسه یا شماره بارنامه مقصد:</label>
                <input
                  type="text"
                  value={targetWaybillId}
                  onChange={(e) => setTargetWaybillId(e.target.value)}
                  placeholder="شناسه بارنامه (UUID) یا شماره بارنامه..."
                  className="w-full p-2 text-xs bg-zinc-50 border border-zinc-300 rounded-xl focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                onClick={() => setManualAttachDoc(null)}
                className="px-4 py-2 text-xs text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
              >
                انصراف
              </button>
              <button
                onClick={handleManualAttachSubmit}
                disabled={attaching || !targetWaybillId}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50"
              >
                {attaching ? "در حال اتصال..." : "اتصال سند"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
