"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  User,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

interface ReviewQueueItem {
  id: string;
  waybillId: string;
  waybillNumber: string;
  driverName: string;
  driverMobile: string;
  method: string;
  amount: string;
  waybillAmount: string;
  remainingAmount: string;
  trackingNumber: string | null;
  bankName: string | null;
  payerCardMasked: string | null;
  receiptDocumentId: string | null;
  status: string;
  version: number;
  createdAt: string;
  isStale: boolean;
}

export default function PaymentsReviewPage() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [staleCount, setStaleCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Rejection modal
  const [rejectingItem, setRejectingItem] = useState<ReviewQueueItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/panel/payments/review-queue");
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) {
          setItems(json.data.items || []);
          setStaleCount(json.data.staleCount || 0);
          setTotal(json.data.total || 0);
        }
      }
    } catch (err) {
      console.error("Failed to load review queue", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  function formatRials(val: string | undefined): string {
    if (!val) return "۰";
    try {
      return BigInt(val).toLocaleString("fa-IR");
    } catch {
      return val;
    }
  }

  async function handleApprove(item: ReviewQueueItem) {
    setProcessingId(item.id);
    try {
      const res = await fetch(`/api/panel/payments/${item.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "APPROVE",
          expectedVersion: item.version,
          notes: "تأیید صحت واریز توسط متصدی",
        }),
      });

      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage({
          type: "success",
          text: `پرداخت بارنامه ${item.waybillNumber} با موفقیت تأیید شد و وضعیت آزادسازی به روز گردید.`,
        });
        loadQueue();
      } else {
        setMessage({
          type: "error",
          text: json.error?.humanMessage || json.message || "خطا در تأیید پرداخت (ممکن است توسط متصدی دیگری بررسی شده باشد).",
        });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    } finally {
      setProcessingId(null);
    }
  }

  async function handleRejectSubmit() {
    if (!rejectingItem || !rejectionReason.trim()) return;
    setProcessingId(rejectingItem.id);

    try {
      const res = await fetch(`/api/panel/payments/${rejectingItem.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "REJECT",
          expectedVersion: rejectingItem.version,
          rejectionReason: rejectionReason.trim(),
        }),
      });

      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage({
          type: "success",
          text: `پرداخت بارنامه ${rejectingItem.waybillNumber} رد گردید و پیام اطلاع‌رسانی ثبت شد.`,
        });
        setRejectingItem(null);
        setRejectionReason("");
        loadQueue();
      } else {
        setMessage({
          type: "error",
          text: json.error?.humanMessage || json.message || "خطا در ثبت رد پرداخت.",
        });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-zinc-900">صف بررسی و بازبینی پرداخت‌های دستی</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
              {total.toLocaleString("fa-IR")} مورد
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            کارتابل بررسی فیش‌های واریزی و کارت‌به‌کارت رانندگان با قفل همروندی نسخه و رعایت SLA
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadQueue}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-xl hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>بروزرسانی صف</span>
          </button>
        </div>
      </div>

      {/* Message Banner */}
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
          <span>{message.text}</span>
        </div>
      )}

      {/* Stale Alert SLA Banner */}
      {staleCount > 0 && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-xs text-rose-800">
          <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <div>
            <strong>هشدار رعایت مهلت زمانی (SLA):</strong> تعداد{" "}
            <span className="font-bold font-mono">{staleCount.toLocaleString("fa-IR")}</span> پرداخت بیش از ۴ ساعت در صف بررسی باقی مانده و نیازمند تعیین تکلیف فوری است.
          </div>
        </div>
      )}

      {/* Review Queue Items */}
      <div className="space-y-4">
        {items.length > 0 ? (
          items.map((item) => (
            <div
              key={item.id}
              className={`p-5 bg-white rounded-2xl border transition-all shadow-sm ${
                item.isStale ? "border-rose-300 bg-rose-50/20" : "border-zinc-200"
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-base text-zinc-900">
                      بارنامه: {item.waybillNumber}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                      {item.method === "CARD_TO_CARD" ? "کارت به کارت / فیش" : "درگاه بانکی"}
                    </span>
                    {item.isStale && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>بیش از ۴ ساعت در صف</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs text-zinc-600">
                    <div className="flex items-center gap-1.5">
                      <User className="w-4 h-4 text-zinc-400" />
                      <span>{item.driverName}</span>
                      <span className="text-zinc-400 font-mono">({item.driverMobile})</span>
                    </div>

                    {item.trackingNumber && (
                      <div>
                        کد پیگیری: <strong className="font-mono text-zinc-800">{item.trackingNumber}</strong>
                      </div>
                    )}

                    {item.bankName && (
                      <div>
                        بانک مبدأ/مقصد: <span className="text-zinc-700">{item.bankName}</span>
                      </div>
                    )}
                  </div>

                  <div className="text-[11px] text-zinc-400">
                    زمان ثبت واریزی: {new Date(item.createdAt).toLocaleDateString("fa-IR")} ساعت{" "}
                    {new Date(item.createdAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>

                {/* Amount & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-t lg:border-t-0 pt-3 lg:pt-0 border-zinc-100">
                  <div className="text-left lg:text-left">
                    <div className="text-[11px] text-zinc-500">مبلغ واریزی اعلام‌شده:</div>
                    <div className="text-lg font-bold font-mono text-emerald-700">
                      {formatRials(item.amount)}{" "}
                      <span className="text-xs font-normal text-zinc-500 font-sans">ریال</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(item)}
                      disabled={processingId === item.id}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-emerald-600/20 transition-all hover:scale-[1.02] flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>{processingId === item.id ? "در حال ثبت..." : "تأیید پرداخت"}</span>
                    </button>

                    <button
                      onClick={() => {
                        setRejectingItem(item);
                        setRejectionReason("");
                      }}
                      disabled={processingId === item.id}
                      className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>رد واریزی</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="p-12 bg-white rounded-2xl border border-zinc-200 shadow-sm text-center space-y-2">
            <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto" />
            <h3 className="font-bold text-sm text-zinc-900">صف بررسی پرداخت‌ها خالی است</h3>
            <p className="text-xs text-zinc-500">تمامی پرداخت‌های ارسالی رانندگان بررسی و تعیین تکلیف شده‌اند.</p>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectingItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-zinc-200 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="font-bold text-sm text-zinc-900">
                رد پرداخت بارنامه {rejectingItem.waybillNumber}
              </h3>
              <button
                onClick={() => setRejectingItem(null)}
                className="text-zinc-400 hover:text-zinc-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-600 mb-1">راننده:</label>
                <div className="font-semibold text-zinc-900">
                  {rejectingItem.driverName} ({rejectingItem.driverMobile})
                </div>
              </div>

              <div>
                <label className="block text-zinc-600 mb-1">مبلغ اعلامی:</label>
                <div className="font-mono text-zinc-800">{formatRials(rejectingItem.amount)} ریال</div>
              </div>

              <div>
                <label className="block text-zinc-700 font-medium mb-1">دلیل رد پرداخت (برای راننده ارسال می‌شود):</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="مثلاً: فیش ناخوانا است، شماره پیگیری تطبیق ندارد، یا وجه به حساب ننشسته است..."
                  rows={3}
                  className="w-full p-2.5 text-xs bg-zinc-50 border border-zinc-300 rounded-xl focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                onClick={() => setRejectingItem(null)}
                className="px-4 py-2 text-xs text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
              >
                انصراف
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={processingId === rejectingItem.id || !rejectionReason.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors disabled:opacity-50"
              >
                {processingId === rejectingItem.id ? "در حال ثبت..." : "تأیید رد واریزی"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
