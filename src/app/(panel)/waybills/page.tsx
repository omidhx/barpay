"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Search,
  RefreshCw,
  ShieldCheck,
  Edit3,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { WAYBILL_PHASE_LABELS, WaybillPhase } from "@/lib/waybills/phase";

interface WaybillItem {
  id: string;
  waybillNumber: string;
  driverName: string;
  driverMobile: string;
  origin: string | null;
  destination: string | null;
  issueDate: string;
  shipmentStatus: string;
  documentStatus: string;
  commitmentStatus: string;
  paymentStatus: string;
  releaseStatus: string;
  phase: WaybillPhase;
  amount: string;
  rawAmount: string;
  roundedAmount: string;
  surchargeAmount: string;
  hasPdf: boolean;
  pdfId: string | null;
  createdAt: string;
}

export default function WaybillsPage() {
  const [waybills, setWaybills] = useState<WaybillItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedPhase, setSelectedPhase] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);

  // Modal state for amount correction
  const [correctingWaybill, setCorrectingWaybill] = useState<WaybillItem | null>(null);
  const [newAmount, setNewAmount] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadWaybills = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/panel/waybills?page=${page}&limit=15&search=${encodeURIComponent(search)}`;
      if (selectedPhase !== "ALL") {
        url += `&phase=${selectedPhase}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) {
          setWaybills(json.data.items || []);
          setTotalCount(json.data.totalCount || 0);
          setTotalPages(json.data.totalPages || 1);
        }
      }
    } catch (err) {
      console.error("Failed to load waybills", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedPhase]);

  useEffect(() => {
    loadWaybills();
  }, [loadWaybills]);

  function formatRials(amountStr: string | undefined): string {
    if (!amountStr) return "۰";
    try {
      return BigInt(amountStr).toLocaleString("fa-IR");
    } catch {
      return amountStr;
    }
  }

  async function handleAuthorizeRelease(waybillId: string) {
    try {
      const res = await fetch(`/api/panel/waybills/${waybillId}/release/authorize`, {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setActionMessage({ type: "success", text: "مجوز ترخیص بارنامه با موفقیت صادر شد." });
        loadWaybills();
      } else {
        setActionMessage({ type: "error", text: json.message || "خطا در صدور مجوز ترخیص." });
      }
    } catch {
      setActionMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    }
    setTimeout(() => setActionMessage(null), 4000);
  }

  async function handleAmountCorrectionSubmit() {
    if (!correctingWaybill || !newAmount) return;
    setSubmittingCorrection(true);
    try {
      const res = await fetch(`/api/panel/waybills/${correctingWaybill.id}/correct-amount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newRawExcelAmount: newAmount,
          reason: correctionReason || "اصلاح توسط متصدی",
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setActionMessage({ type: "success", text: "مبلغ بارنامه با موفقیت اصلاح شد و محاسبات به‌روز گردید." });
        setCorrectingWaybill(null);
        setNewAmount("");
        setCorrectionReason("");
        loadWaybills();
      } else {
        setActionMessage({ type: "error", text: json.message || "خطا در اصلاح مبلغ." });
      }
    } catch {
      setActionMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    } finally {
      setSubmittingCorrection(false);
    }
    setTimeout(() => setActionMessage(null), 4000);
  }

  const phaseColors: Record<string, { bg: string; text: string; border: string }> = {
    IMPORTED: { bg: "bg-zinc-100", text: "text-zinc-700", border: "border-zinc-200" },
    PDF_ATTACHED: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
    AWAITING_COMMITMENT: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" },
    AWAITING_PAYMENT: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    PAYMENT_UNDER_REVIEW: { bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-200" },
    PAYMENT_REJECTED: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
    RESIDUAL_PAYMENT: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
    READY_FOR_RELEASE: { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200" },
    RELEASED: { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" },
    COMPLETED: { bg: "bg-teal-50", text: "text-teal-800", border: "border-teal-200" },
    CANCELLED: { bg: "bg-zinc-200", text: "text-zinc-600", border: "border-zinc-300" },
    NEEDS_ATTENTION: { bg: "bg-red-50", text: "text-red-700", border: "border-red-300" },
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">مدیریت و نظارت بر بارنامه‌ها</h1>
          <p className="text-xs text-zinc-500 mt-1">
            مشاهده وضعیت ۵ محور مستقل، فازهای مشتق، اصلاح مبالغ و صدور مجوز ترخیص
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadWaybills}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-xl hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>بروزرسانی</span>
          </button>
        </div>
      </div>

      {/* Action Notification Message */}
      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 transition-all ${
            actionMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {actionMessage.type === "success" ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Search & Phase Filters */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-zinc-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="جستجو با شماره بارنامه، نام یا موبایل راننده..."
              className="w-full pr-9 pl-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="text-xs text-zinc-500">
            مجموع بارنامه‌ها: <strong className="text-zinc-900 font-mono">{totalCount.toLocaleString("fa-IR")}</strong> فقره
          </div>
        </div>

        {/* Phase Filter Chips */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-zinc-100">
          <button
            onClick={() => { setSelectedPhase("ALL"); setPage(1); }}
            className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              selectedPhase === "ALL"
                ? "bg-blue-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            همه فازها
          </button>
          {Object.entries(WAYBILL_PHASE_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setSelectedPhase(key); setPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors ${
                selectedPhase === key
                  ? "bg-blue-600 text-white font-medium"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Waybills Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500">
              <tr>
                <th className="py-3 px-4 font-semibold">شماره بارنامه</th>
                <th className="py-3 px-4 font-semibold">مشخصات راننده</th>
                <th className="py-3 px-4 font-semibold">مسیر حمل</th>
                <th className="py-3 px-4 font-semibold">مبلغ نهایی (ریال)</th>
                <th className="py-3 px-4 font-semibold">فاز فعلی</th>
                <th className="py-3 px-4 font-semibold">سند PDF</th>
                <th className="py-3 px-4 font-semibold text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {waybills.length > 0 ? (
                waybills.map((w) => {
                  const color = phaseColors[w.phase] || phaseColors.IMPORTED;
                  const phaseLabel = WAYBILL_PHASE_LABELS[w.phase] || w.phase;

                  return (
                    <tr key={w.id} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-zinc-900">
                        {w.waybillNumber}
                        <div className="text-[10px] text-zinc-400 font-sans">
                          {new Date(w.issueDate).toLocaleDateString("fa-IR")}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-zinc-900">{w.driverName}</div>
                        <div className="text-[11px] text-zinc-500 font-mono">{w.driverMobile}</div>
                      </td>
                      <td className="py-3.5 px-4 text-zinc-600">
                        {w.origin && w.destination ? (
                          <span>{w.origin} ← {w.destination}</span>
                        ) : (
                          <span className="text-zinc-400">-</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-700">
                        {formatRials(w.amount)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${color.bg} ${color.text} ${color.border}`}
                        >
                          {phaseLabel}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {w.hasPdf ? (
                          <a
                            href={`/api/panel/waybills/${w.id}/download`}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>مشاهده</span>
                          </a>
                        ) : (
                          <span className="text-zinc-400 text-[11px]">بارگذاری نشده</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Correct Amount Button */}
                          <button
                            onClick={() => {
                              setCorrectingWaybill(w);
                              setNewAmount(w.rawAmount);
                              setCorrectionReason("");
                            }}
                            className="p-1.5 text-zinc-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="اصلاح مبلغ بارنامه"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          {/* Authorize Release Button */}
                          {w.releaseStatus === "ELIGIBLE" && (
                            <button
                              onClick={() => handleAuthorizeRelease(w.id)}
                              className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1"
                              title="صدور مجوز آزادسازی بارنامه"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>مجوز ترخیص</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-400">
                    هیچ بارنامه‌ای مطابق با فیلترها یافت نشد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-600">
            <div>
              صفحه <strong className="font-mono">{page}</strong> از <strong className="font-mono">{totalPages}</strong>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal for Correct Amount */}
      {correctingWaybill && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-zinc-200 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="font-bold text-sm text-zinc-900">
                اصلاح مبلغ بارنامه {correctingWaybill.waybillNumber}
              </h3>
              <button
                onClick={() => setCorrectingWaybill(null)}
                className="text-zinc-400 hover:text-zinc-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-600 mb-1">راننده:</label>
                <div className="font-semibold text-zinc-900">{correctingWaybill.driverName} ({correctingWaybill.driverMobile})</div>
              </div>

              <div>
                <label className="block text-zinc-600 mb-1">مبلغ فعلی خام اکسل (ریال):</label>
                <div className="font-mono text-zinc-700 bg-zinc-50 p-2 rounded-lg border border-zinc-200">
                  {formatRials(correctingWaybill.rawAmount)} ریال
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 font-medium mb-1">مبلغ خام جدید اکسل (ریال):</label>
                <input
                  type="text"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="مثلاً 85000000"
                  className="w-full p-2 text-xs font-mono bg-zinc-50 border border-zinc-300 rounded-xl focus:outline-none focus:border-blue-500"
                />
                <p className="text-[10px] text-zinc-400 mt-1">
                  سامانه به صورت خودکار سقف‌گردی به مضرب ۵۰٬۰۰۰ ریال و حق بیمه ۷۰۰٬۰۰۰ ریال را محاسبه خواهد کرد.
                </p>
              </div>

              <div>
                <label className="block text-zinc-700 font-medium mb-1">دلیل اصلاح مبلغ:</label>
                <textarea
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="مثلاً تغییر کرایه طبق صورت‌جلسه بارگیری..."
                  rows={2}
                  className="w-full p-2 text-xs bg-zinc-50 border border-zinc-300 rounded-xl focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                onClick={() => setCorrectingWaybill(null)}
                className="px-4 py-2 text-xs text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
              >
                انصراف
              </button>
              <button
                onClick={handleAmountCorrectionSubmit}
                disabled={submittingCorrection || !newAmount}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50"
              >
                {submittingCorrection ? "در حال ذخیره..." : "ثبت و محاسبه مجدد"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
