"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FileSpreadsheet,
  Download,
  Search,
  RefreshCw,
  Calculator,
  CheckCircle2,
} from "lucide-react";

interface PaymentItem {
  id: string;
  waybillNumber: string;
  driverName: string;
  driverMobile: string;
  amount: string;
  method: string;
  bankName: string | null;
  trackingNumber: string | null;
  referenceNumber: string | null;
  payerCardMasked: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
}

interface RoundingSummary {
  totalCount: number;
  totalRawAmount: string;
  totalRoundedAmount: string;
  totalRoundingExcess: string;
  totalSurcharge: string;
  totalPayable: string;
  roundedUpCount: number;
  exactCount: number;
}

interface RoundingItem {
  waybillNumber: string;
  driverName: string;
  paymentStatus: string;
  rawExcelAmount: string;
  roundedAmount: string;
  roundingExcess: string;
  surchargeAmount: string;
  payableAmount: string;
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<"payments" | "rounding">("payments");
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [totalPaymentsAmount, setTotalPaymentsAmount] = useState<string>("0");
  const [totalPaymentsCount, setTotalPaymentsCount] = useState<number>(0);

  const [roundingSummary, setRoundingSummary] = useState<RoundingSummary | null>(null);
  const [roundingItems, setRoundingItems] = useState<RoundingItem[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [payRes, roundRes] = await Promise.all([
        fetch(`/api/panel/reports/payments?search=${encodeURIComponent(searchQuery)}`),
        fetch("/api/panel/reports/rounding"),
      ]);

      if (payRes.ok) {
        const json = await payRes.json();
        if (json.ok && json.data) {
          setPayments(json.data.items || []);
          setTotalPaymentsAmount(json.data.totalAmount || "0");
          setTotalPaymentsCount(json.data.totalCount || 0);
        }
      }

      if (roundRes.ok) {
        const json = await roundRes.json();
        if (json.ok && json.data) {
          setRoundingSummary(json.data.summary);
          setRoundingItems(json.data.items || []);
        }
      }
    } catch (err) {
      console.error("Failed to fetch reports", err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function formatRials(val: string | undefined): string {
    if (!val) return "۰";
    try {
      return BigInt(val).toLocaleString("fa-IR");
    } catch {
      return val;
    }
  }

  function handleExportCsv() {
    setDownloading(true);
    const endpoint =
      activeTab === "payments"
        ? `/api/panel/reports/payments?export=csv&search=${encodeURIComponent(searchQuery)}`
        : `/api/panel/reports/rounding?export=csv`;

    window.open(endpoint, "_blank");
    setTimeout(() => setDownloading(false), 1500);
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">گزارش‌های مالی و تسویه</h1>
          <p className="text-xs text-zinc-500 mt-1">
            مشاهده ریز واریزی‌ها، مازاد گردکردن و دریافت خروجی اکسل ایمن (CSV با محافظت فرمول)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-xl hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>بروزرسانی</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={downloading}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloading ? "در حال تولید خروجی..." : "دریافت فایل اکسل (CSV)"}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-medium">مجموع پرداختی‌های تایید شده</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-zinc-900 font-mono">
            {formatRials(totalPaymentsAmount)}{" "}
            <span className="text-xs font-normal text-zinc-500 font-sans">ریال</span>
          </div>
          <div className="text-xs text-zinc-400 mt-1">
            {totalPaymentsCount.toLocaleString("fa-IR")} پرداخت مصوب
          </div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-medium">مازاد حاصل از سقف‌گردی (Ceil)</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Calculator className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-zinc-900 font-mono">
            {formatRials(roundingSummary?.totalRoundingExcess)}{" "}
            <span className="text-xs font-normal text-zinc-500 font-sans">ریال</span>
          </div>
          <div className="text-xs text-zinc-400 mt-1">
            گرد شده به مضرب ۵۰٬۰۰۰ ریال
          </div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-medium">کل مبالغ خام فایل‌های اکسل</span>
            <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-zinc-900 font-mono">
            {formatRials(roundingSummary?.totalRawAmount)}{" "}
            <span className="text-xs font-normal text-zinc-500 font-sans">ریال</span>
          </div>
          <div className="text-xs text-zinc-400 mt-1">
            {(roundingSummary?.roundedUpCount ?? 0).toLocaleString("fa-IR")} مورد نیازمند گرد کردن
          </div>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("payments")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "payments"
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              ریز واریزی‌های تأییدشده
            </button>
            <button
              onClick={() => setActiveTab("rounding")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "rounding"
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              تحلیل مازاد گردکردن (Ceil-Rounding)
            </button>
          </div>

          {activeTab === "payments" && (
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-zinc-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو با شماره بارنامه یا نام راننده..."
                className="w-full pr-9 pl-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
        </div>

        {/* Payments Table */}
        {activeTab === "payments" && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500">
                <tr>
                  <th className="py-3 px-3 font-semibold">شماره بارنامه</th>
                  <th className="py-3 px-3 font-semibold">نام راننده</th>
                  <th className="py-3 px-3 font-semibold">روش پرداخت</th>
                  <th className="py-3 px-3 font-semibold">شماره پیگیری</th>
                  <th className="py-3 px-3 font-semibold">مبلغ تأییدشده (ریال)</th>
                  <th className="py-3 px-3 font-semibold">تاریخ تأیید</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {payments.length > 0 ? (
                  payments.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="py-3 px-3 font-mono font-medium text-zinc-900">
                        {p.waybillNumber}
                      </td>
                      <td className="py-3 px-3 text-zinc-800">
                        {p.driverName}
                        <div className="text-[10px] text-zinc-400 font-mono">{p.driverMobile}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            p.method === "GATEWAY"
                              ? "bg-blue-50 text-blue-700 border border-blue-100"
                              : "bg-purple-50 text-purple-700 border border-purple-100"
                          }`}
                        >
                          {p.method === "GATEWAY" ? "درگاه اینترنتی" : "کارت به کارت / فیش"}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-zinc-600">
                        {p.trackingNumber || "-"}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-700">
                        {formatRials(p.amount)}
                      </td>
                      <td className="py-3 px-3 text-zinc-500 font-mono">
                        {p.reviewedAt
                          ? new Date(p.reviewedAt).toLocaleDateString("fa-IR")
                          : "-"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-400">
                      هیچ پرداختی یافت نشد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Rounding Table */}
        {activeTab === "rounding" && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500">
                <tr>
                  <th className="py-3 px-3 font-semibold">شماره بارنامه</th>
                  <th className="py-3 px-3 font-semibold">نام راننده</th>
                  <th className="py-3 px-3 font-semibold">مبلغ خام اکسل</th>
                  <th className="py-3 px-3 font-semibold">مبلغ گردشده (سقف ۵۰هزار)</th>
                  <th className="py-3 px-3 font-semibold">مازاد گردکردن</th>
                  <th className="py-3 px-3 font-semibold">حق بیمه و خدمات</th>
                  <th className="py-3 px-3 font-semibold">مبلغ نهایی راننده</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {roundingItems.length > 0 ? (
                  roundingItems.map((r, i) => (
                    <tr key={i} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="py-3 px-3 font-mono font-medium text-zinc-900">
                        {r.waybillNumber}
                      </td>
                      <td className="py-3 px-3 text-zinc-800">{r.driverName}</td>
                      <td className="py-3 px-3 font-mono text-zinc-600">
                        {formatRials(r.rawExcelAmount)}
                      </td>
                      <td className="py-3 px-3 font-mono text-zinc-800">
                        {formatRials(r.roundedAmount)}
                      </td>
                      <td className="py-3 px-3 font-mono text-blue-600 font-medium">
                        +{formatRials(r.roundingExcess)}
                      </td>
                      <td className="py-3 px-3 font-mono text-zinc-500">
                        {formatRials(r.surchargeAmount)}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-700">
                        {formatRials(r.payableAmount)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-400">
                      موردی یافت نشد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
