"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  FileText,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  User,
  CreditCard,
  Building2,
  Download,
  AlertCircle,
  Truck,
  Edit3,
  Calendar,
  MapPin,
  ExternalLink,
} from "lucide-react";
import { WAYBILL_PHASE_LABELS, WaybillPhase } from "@/lib/waybills/phase";

interface AmountHistoryItem {
  id: string;
  rawExcelAmount: string;
  roundedAmount: string;
  surchargeAmount: string;
  amount: string;
  source: string;
  reason: string | null;
  isCurrent: boolean;
  createdAt: string;
}

interface PaymentRecord {
  id: string;
  amount: string;
  method: string;
  status: string;
  trackingNumber: string | null;
  referenceNumber: string | null;
  payerCardMasked: string | null;
  bankName: string | null;
  payoutCardNumber: string | null;
  receiptDocumentId: string | null;
  createdAt: string;
  reviews: Array<{
    id: string;
    decision: string;
    notes: string | null;
    reviewerId: string;
    reviewedAt: string;
  }>;
  refunds: Array<{
    id: string;
    amount: string;
    reason: string;
    status: string;
    createdAt: string;
  }>;
}

interface DocumentRecord {
  id: string;
  documentType: string;
  storageKey: string;
  fileSize: number;
  matchingStatus: string;
  matchingMethod: string | null;
  extractedWaybillNumber: string | null;
  createdAt: string;
}

interface AcceptanceRecord {
  id: string;
  commitmentTitle: string;
  contentHash: string;
  renderedText: string;
  signedAt: string;
  signatureDocumentId: string | null;
  ip: string | null;
}

interface AuditLogRecord {
  id: string;
  eventType: string;
  actorType: string;
  actorId: string | null;
  prevStatus: string | null;
  newStatus: string | null;
  reason: string | null;
  createdAt: string;
}

interface WaybillDetail {
  id: string;
  waybillNumber: string;
  waybillYear: number | null;
  driverName: string;
  driverMobile: string;
  plateNumber: string | null;
  issueDate: string;
  origin: string | null;
  destination: string | null;
  grossAmount: string | null;
  netAmount: string | null;
  commissionAmount: string | null;
  deductionsAmount: string | null;
  shipmentStatus: string;
  documentStatus: string;
  paymentStatus: string;
  commitmentStatus: string;
  releaseStatus: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  derivedPhase: WaybillPhase;
  currentAmount: {
    id: string;
    rawExcelAmount: string;
    roundedAmount: string;
    surchargeAmount: string;
    amount: string;
    source: string;
    reason: string | null;
    createdAt: string;
  } | null;
  remainingAmount: string;
  approvedPaymentsSum: string;
  amountsHistory: AmountHistoryItem[];
  payments: PaymentRecord[];
  documents: DocumentRecord[];
  acceptances: AcceptanceRecord[];
  releaseAuthorizations: Array<{
    id: string;
    authorizedBy: string;
    authorizedAt: string;
    expiresAt: string | null;
  }>;
  gatewayTransactions: Array<{
    id: string;
    provider: string;
    providerReference: string | null;
    amount: string;
    status: string;
    errorCode: string | null;
    createdAt: string;
  }>;
  driverLinkToken: string | null;
  auditLogs: AuditLogRecord[];
}

export default function WaybillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<WaybillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Correction modal
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [newPayableAmount, setNewPayableAmount] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");

  const loadWaybill = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/panel/waybills/${id}`);
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) {
          setData(json.data);
          if (json.data.currentAmount) {
            setNewPayableAmount(json.data.currentAmount.amount);
          }
        } else {
          setMessage({ type: "error", text: json.message || "بارنامه یافت نشد." });
        }
      } else {
        setMessage({ type: "error", text: "خطا در دریافت اطلاعات بارنامه." });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadWaybill();
  }, [loadWaybill]);

  const handleAuthorizeRelease = async () => {
    if (!data) return;
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/panel/waybills/${data.id}/release/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "صدور دستی مجوز ترخیص توسط متصدی پنل" }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage({ type: "success", text: "مجوز ترخیص بارنامه با موفقیت صادر شد." });
        loadWaybill();
      } else {
        setMessage({ type: "error", text: json.error?.humanMessage || json.message || "خطا در صدور مجوز ترخیص." });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeRelease = async () => {
    if (!data) return;
    const reason = window.prompt("لطفاً دلیل لغو ترخیص بارنامه را وارد فرمایید:");
    if (!reason) return;

    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/panel/waybills/${data.id}/release/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage({ type: "success", text: "مجوز ترخیص با موفقیت لغو و بارنامه مسدود شد." });
        loadWaybill();
      } else {
        setMessage({ type: "error", text: json.error?.humanMessage || json.message || "خطا در لغو ترخیص." });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCorrectAmount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !newPayableAmount || !correctionReason) return;
    setActionLoading(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/panel/waybills/${data.id}/correct-amount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPayableAmount,
          reason: correctionReason,
        }),
      });

      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage({ type: "success", text: "مبلغ بارنامه با موفقیت اصلاح و مابقی جدید محاسبه شد." });
        setShowCorrectionModal(false);
        setCorrectionReason("");
        loadWaybill();
      } else {
        setMessage({ type: "error", text: json.error?.humanMessage || json.message || "خطا در اصلاح مبلغ." });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در برقراری ارتباط." });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-zinc-500 gap-3">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
        <span className="text-sm font-medium">در حال بارگذاری اطلاعات کامل بارنامه...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-zinc-200 space-y-4 max-w-md mx-auto my-12">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-base font-bold text-zinc-900">بارنامه مورد نظر یافت نشد</h2>
        <Link
          href="/waybills"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700"
        >
          <ArrowRight className="w-4 h-4" />
          <span>بازگشت به فهرست بارنامه‌ها</span>
        </Link>
      </div>
    );
  }

  const phaseLabel = WAYBILL_PHASE_LABELS[data.derivedPhase] || data.derivedPhase;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" dir="rtl">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Link href="/waybills" className="hover:text-blue-600 flex items-center gap-1 transition-colors">
              <ArrowRight className="w-3.5 h-3.5" />
              <span>فهرست بارنامه‌ها</span>
            </Link>
            <span>/</span>
            <span className="font-semibold text-zinc-800">بارنامه شماره {data.waybillNumber}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-black text-zinc-900">بارنامه {data.waybillNumber}</h1>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
              {phaseLabel}
            </span>
            <span className="text-xs text-zinc-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(data.issueDate).toLocaleDateString("fa-IR")}
            </span>
          </div>
        </div>

        {/* Operational Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowCorrectionModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors"
          >
            <Edit3 className="w-4 h-4" />
            <span>اصلاح مبلغ</span>
          </button>

          {data.releaseStatus !== "RELEASED" && data.releaseStatus !== "AUTHORIZED" && (
            <button
              onClick={handleAuthorizeRelease}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 rounded-xl shadow-sm transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>صدور مجوز ترخیص</span>
            </button>
          )}

          {(data.releaseStatus === "RELEASED" || data.releaseStatus === "AUTHORIZED") && (
            <button
              onClick={handleRevokeRelease}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>لغو مجوز ترخیص</span>
            </button>
          )}

          {data.driverLinkToken && (
            <a
              href={`/driver/demo-driver-token`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>مشاهده درگاه راننده</span>
            </a>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {message && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center gap-2.5 transition-all ${
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
          <span className="font-medium">{message.text}</span>
        </div>
      )}

      {/* Grid: Sections 1 to 4 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Section 1 & 2: Main Details & Driver */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1 & 2 Card */}
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-5">
            <h2 className="text-sm font-bold text-zinc-900 border-b border-zinc-100 pb-3 flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-600" />
              <span>مشخصات بارنامه و اطلاعات راننده</span>
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5 text-xs">
              <div>
                <span className="text-zinc-400 block mb-1">شماره بارنامه</span>
                <span className="font-bold text-zinc-900 font-mono text-sm">{data.waybillNumber}</span>
              </div>
              <div>
                <span className="text-zinc-400 block mb-1">نام راننده</span>
                <span className="font-bold text-zinc-900 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-zinc-400" />
                  {data.driverName}
                </span>
              </div>
              <div>
                <span className="text-zinc-400 block mb-1">شماره تماس راننده</span>
                <span className="font-bold text-zinc-900 font-mono">{data.driverMobile}</span>
              </div>
              <div>
                <span className="text-zinc-400 block mb-1">شماره پلاک ناوگان</span>
                <span className="font-bold text-zinc-800 font-mono bg-zinc-50 px-2 py-1 rounded-lg border border-zinc-200 inline-block">
                  {data.plateNumber || "ثبت نشده"}
                </span>
              </div>
              <div>
                <span className="text-zinc-400 block mb-1">مبدأ حرکت</span>
                <span className="font-bold text-zinc-800 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                  {data.origin || "نامشخص"}
                </span>
              </div>
              <div>
                <span className="text-zinc-400 block mb-1">مقصد تخلیه</span>
                <span className="font-bold text-zinc-800 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                  {data.destination || "نامشخص"}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Amounts Breakdown and Chain */}
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <span>محاسبات مالی، سقف‌گردی و مانده پرداخت</span>
              </h2>
              <span className="text-[11px] text-zinc-400">واحد مبالغ: ریال (IRR)</span>
            </div>

            {/* Financial Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl">
                <span className="text-[11px] text-zinc-500 block mb-1">مبلغ خام اکسل</span>
                <span className="text-xs font-bold text-zinc-800 font-mono">
                  {data.currentAmount ? Number(data.currentAmount.rawExcelAmount).toLocaleString("fa-IR") : "۰"}
                </span>
              </div>
              <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl">
                <span className="text-[11px] text-zinc-500 block mb-1">گردشده (مضرب ۵۰ هزار)</span>
                <span className="text-xs font-bold text-zinc-800 font-mono">
                  {data.currentAmount ? Number(data.currentAmount.roundedAmount).toLocaleString("fa-IR") : "۰"}
                </span>
              </div>
              <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl">
                <span className="text-[11px] text-zinc-500 block mb-1">مازاد/افزودنی سازمان</span>
                <span className="text-xs font-bold text-blue-700 font-mono">
                  {data.currentAmount ? Number(data.currentAmount.surchargeAmount).toLocaleString("fa-IR") : "۰"}
                </span>
              </div>
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl">
                <span className="text-[11px] text-blue-800 block mb-1 font-semibold">کل مبلغ قابل پرداخت</span>
                <span className="text-sm font-black text-blue-900 font-mono">
                  {data.currentAmount ? Number(data.currentAmount.amount).toLocaleString("fa-IR") : "۰"}
                </span>
              </div>
            </div>

            {/* Settlement Status Banner */}
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-zinc-50 border border-zinc-200 rounded-xl gap-3 text-xs">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-zinc-500 block">مجموع پرداخت‌های تأییدشده:</span>
                  <span className="font-bold text-emerald-700 font-mono text-sm">
                    {Number(data.approvedPaymentsSum).toLocaleString("fa-IR")} ریال
                  </span>
                </div>
                <div className="border-r border-zinc-200 pr-4">
                  <span className="text-zinc-500 block">مانده بدهی راننده:</span>
                  <span
                    className={`font-black font-mono text-sm ${
                      Number(data.remainingAmount) > 0 ? "text-rose-600" : "text-emerald-700"
                    }`}
                  >
                    {Number(data.remainingAmount).toLocaleString("fa-IR")} ریال
                  </span>
                </div>
              </div>

              {Number(data.remainingAmount) === 0 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  تسویه کامل
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 rounded-full font-bold">
                  <Clock className="w-3.5 h-3.5" />
                  دارای مابقی قابل پرداخت
                </span>
              )}
            </div>

            {/* Amounts History Table */}
            {data.amountsHistory.length > 1 && (
              <div className="space-y-2 pt-2">
                <h3 className="text-xs font-bold text-zinc-700">تاریخچه اصلاحات مبالغ</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right border border-zinc-200 rounded-xl overflow-hidden">
                    <thead className="bg-zinc-100 text-zinc-600">
                      <tr>
                        <th className="p-2.5">منبع</th>
                        <th className="p-2.5">مبلغ جدید</th>
                        <th className="p-2.5">دلیل اصلاح</th>
                        <th className="p-2.5">تاریخ ثبت</th>
                        <th className="p-2.5">وضعیت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                      {data.amountsHistory.map((h) => (
                        <tr key={h.id}>
                          <td className="p-2.5 font-medium">{h.source}</td>
                          <td className="p-2.5 font-bold font-mono">{Number(h.amount).toLocaleString("fa-IR")}</td>
                          <td className="p-2.5 text-zinc-500">{h.reason || "محاسبه خودکار اولیه"}</td>
                          <td className="p-2.5 text-zinc-500">{new Date(h.createdAt).toLocaleDateString("fa-IR")}</td>
                          <td className="p-2.5">
                            {h.isCurrent ? (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md font-semibold text-[10px]">
                                فعال
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded-md text-[10px]">
                                باطل‌شده
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 4: 5 Axes Status Matrix */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-zinc-900 border-b border-zinc-100 pb-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-purple-600" />
              <span>ماتریس وضعیت محورهای ۵ گانه</span>
            </h2>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-zinc-500 block text-[11px]">محور حمل‌ونقل</span>
                  <span className="font-bold text-zinc-800">Shipment Status</span>
                </div>
                <span className="px-2.5 py-1 bg-white border border-zinc-300 rounded-lg font-bold font-mono text-zinc-700">
                  {data.shipmentStatus}
                </span>
              </div>

              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-zinc-500 block text-[11px]">محور سند و PDF</span>
                  <span className="font-bold text-zinc-800">Document Status</span>
                </div>
                <span className="px-2.5 py-1 bg-white border border-zinc-300 rounded-lg font-bold font-mono text-zinc-700">
                  {data.documentStatus}
                </span>
              </div>

              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-zinc-500 block text-[11px]">محور تعهدنامه و امضا</span>
                  <span className="font-bold text-zinc-800">Commitment Status</span>
                </div>
                <span className="px-2.5 py-1 bg-white border border-zinc-300 rounded-lg font-bold font-mono text-zinc-700">
                  {data.commitmentStatus}
                </span>
              </div>

              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-zinc-500 block text-[11px]">محور پرداخت</span>
                  <span className="font-bold text-zinc-800">Payment Status</span>
                </div>
                <span className="px-2.5 py-1 bg-white border border-zinc-300 rounded-lg font-bold font-mono text-zinc-700">
                  {data.paymentStatus}
                </span>
              </div>

              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-zinc-500 block text-[11px]">محور ترخیص و تحویل</span>
                  <span className="font-bold text-zinc-800">Release Status</span>
                </div>
                <span className="px-2.5 py-1 bg-white border border-zinc-300 rounded-lg font-bold font-mono text-zinc-700">
                  {data.releaseStatus}
                </span>
              </div>
            </div>

            <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-xl text-xs space-y-1">
              <span className="text-purple-700 font-semibold block">فاز اشتقاقی کل (Derived Phase):</span>
              <span className="font-black text-purple-900 text-sm">{phaseLabel}</span>
            </div>
          </div>

          {/* Section 5: Attached PDF Document Card */}
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-zinc-900 border-b border-zinc-100 pb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>سند PDF بارنامه</span>
            </h2>

            {data.documents.length > 0 ? (
              <div className="space-y-3">
                {data.documents.map((doc) => (
                  <div key={doc.id} className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-800 truncate max-w-[180px]">
                        {doc.storageKey.split("/").pop()}
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-bold">
                        {doc.matchingStatus}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500 flex items-center justify-between">
                      <span>حجم: {(doc.fileSize / 1024).toFixed(1)} کیلوبایت</span>
                      <span>روش تطبیق: {doc.matchingMethod || "خودکار"}</span>
                    </div>
                    <a
                      href={`/api/panel/waybills/${data.id}/download`}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-white border border-zinc-300 rounded-lg font-semibold text-zinc-700 hover:bg-zinc-100 text-xs transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>دانلود مستقیم سند PDF</span>
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5 text-center bg-zinc-50 rounded-xl border border-dashed border-zinc-300 space-y-2">
                <FileText className="w-8 h-8 text-zinc-300 mx-auto" />
                <span className="text-xs text-zinc-500 block">هنوز فایلی برای این بارنامه تطبیق نیافته است.</span>
                <Link
                  href="/documents"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-semibold"
                >
                  <span>بارگذاری و تطبیق سند PDF</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 6: Payment Transactions Table */}
      <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-600" />
            <span>تراکنش‌های پرداخت و فیش‌های ثبت‌شده راننده</span>
          </h2>
          <span className="text-xs text-zinc-500">{data.payments.length.toLocaleString("fa-IR")} مورد</span>
        </div>

        {data.payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right border border-zinc-200 rounded-xl overflow-hidden">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="p-3">روش پرداخت</th>
                  <th className="p-3">مبلغ (ریال)</th>
                  <th className="p-3">بانک و کارت مقصد</th>
                  <th className="p-3">کد رهگیری / مرجع</th>
                  <th className="p-3">وضعیت بازبینی</th>
                  <th className="p-3">تاریخ ثبت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {data.payments.map((pm) => (
                  <tr key={pm.id} className="hover:bg-zinc-50/50">
                    <td className="p-3 font-semibold">
                      {pm.method === "ONLINE_GATEWAY" ? "درگاه اینترنتی" : "کارت‌به‌کارت"}
                    </td>
                    <td className="p-3 font-bold font-mono text-zinc-900">
                      {Number(pm.amount).toLocaleString("fa-IR")}
                    </td>
                    <td className="p-3 text-zinc-700">
                      {pm.bankName || "بانک پیش‌فرض"}
                      {pm.payoutCardNumber && (
                        <span className="block text-[11px] text-zinc-400 font-mono">
                          {pm.payoutCardNumber}
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono font-medium text-zinc-800">
                      {pm.trackingNumber || pm.referenceNumber || "—"}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          pm.status === "APPROVED"
                            ? "bg-emerald-100 text-emerald-800"
                            : pm.status === "REJECTED"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {pm.status === "APPROVED"
                          ? "تأییدشده"
                          : pm.status === "REJECTED"
                          ? "ردشده"
                          : "در انتظار بررسی"}
                      </span>
                    </td>
                    <td className="p-3 text-zinc-500">
                      {new Date(pm.createdAt).toLocaleString("fa-IR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-zinc-400">
            هنوز تراکنش یا فیش واریزی برای این بارنامه ثبت نشده است.
          </div>
        )}
      </div>

      {/* Section 7: Driver Commitment & Digital Signature */}
      <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-zinc-900 border-b border-zinc-100 pb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          <span>تعهدنامه حقوقی و اقرار الکترونیک راننده</span>
        </h2>

        {data.acceptances.length > 0 ? (
          <div className="space-y-4 text-xs">
            {data.acceptances.map((acc) => (
              <div key={acc.id} className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-2.5">
                  <div>
                    <span className="font-bold text-zinc-900 block">{acc.commitmentTitle}</span>
                    <span className="text-[11px] text-zinc-400 font-mono">هش محتوا: {acc.contentHash.substring(0, 16)}...</span>
                  </div>
                  <div className="text-right">
                    <span className="text-zinc-500 block text-[11px]">زمان امضا: {new Date(acc.signedAt).toLocaleString("fa-IR")}</span>
                    {acc.ip && <span className="text-zinc-400 text-[10px] font-mono">IP: {acc.ip}</span>}
                  </div>
                </div>

                {/* Rendered Text */}
                <div className="p-3.5 bg-white border border-zinc-200 rounded-lg text-zinc-700 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {acc.renderedText}
                </div>

                <div className="flex items-center gap-2 text-emerald-700 font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تعهدنامه به صورت قانونی و با کد اعتبارسنجی تلفن همراه پذیرفته شده است.</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-zinc-400">
            راننده هنوز تعهدنامه حقوقی این بارنامه را امضا یا تایید نکرده است.
          </div>
        )}
      </div>

      {/* Section 8: Audit Trail & Historical Events */}
      <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-zinc-900 border-b border-zinc-100 pb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-zinc-500" />
          <span>لاگ زنجیره‌ای وقایع و حسابرسی (Audit Trail)</span>
        </h2>

        {data.auditLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right border border-zinc-200 rounded-xl overflow-hidden">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="p-2.5">عنوان رویداد</th>
                  <th className="p-2.5">عامل</th>
                  <th className="p-2.5">وضعیت قبلی → بعدی</th>
                  <th className="p-2.5">توضیحات</th>
                  <th className="p-2.5">زمان ثبت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {data.auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="p-2.5 font-semibold text-zinc-800">{log.eventType}</td>
                    <td className="p-2.5 text-zinc-600">{log.actorType}</td>
                    <td className="p-2.5 font-mono text-[11px] text-zinc-500">
                      {log.prevStatus ? `${log.prevStatus} → ` : ""}{log.newStatus || "—"}
                    </td>
                    <td className="p-2.5 text-zinc-600">{log.reason || "عملیات استاندارد"}</td>
                    <td className="p-2.5 text-zinc-400 font-mono">
                      {new Date(log.createdAt).toLocaleTimeString("fa-IR")} - {new Date(log.createdAt).toLocaleDateString("fa-IR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-zinc-400">رویدادی ثبت نشده است.</div>
        )}
      </div>

      {/* Correction Modal */}
      {showCorrectionModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-zinc-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-zinc-900">اصلاح رسمی مبلغ بارنامه</h3>
              <button onClick={() => setShowCorrectionModal(false)} className="text-zinc-400 hover:text-zinc-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleCorrectAmount} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-700 font-semibold mb-1">
                  مبلغ جدید قابل پرداخت (ریال)
                </label>
                <input
                  type="text"
                  value={newPayableAmount}
                  onChange={(e) => setNewPayableAmount(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-zinc-700 font-semibold mb-1">
                  علت اصلاح مبلغ (جهت ثبت در دفتر کل حسابرسی)
                </label>
                <textarea
                  rows={3}
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  required
                  placeholder="مثال: کسر هزینه باسکول طبق توافق تلفنی با راننده..."
                  className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowCorrectionModal(false)}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:bg-zinc-300 shadow-sm"
                >
                  {actionLoading ? "در حال ثبت..." : "تأیید و اعمال اصلاحیه"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
