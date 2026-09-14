"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  MessageSquare,
  RefreshCw,
  ExternalLink,
  CreditCard,
  AlertCircle,
} from "lucide-react";
import { WAYBILL_PHASE_LABELS, WaybillPhase } from "@/lib/waybills/phase";

interface DashboardData {
  phases: Record<WaybillPhase, number>;
  kpis: {
    totalWaybills: number;
    pendingReviewsCount: number;
    staleReviewsCount: number;
    releasedCount: number;
    totalPaidAmount: string;
    todayPaidAmount: string;
  };
}

interface SmsDashboardData {
  dailyStats?: {
    dailyCap: number;
    sentToday: number;
    failedToday: number;
    pendingToday: number;
    remainingToday: number;
    usagePercent: number;
    isWarningThreshold: boolean;
  };
  circuitBreaker?: {
    primaryProvider: string;
    primaryState: string;
    secondaryProvider: string;
    isFailoverActive: boolean;
  };
  recentFailures?: Array<{
    id: string;
    recipient: string;
    templateKey: string;
    persianReason: string;
    attempts: number;
    createdAt: string;
  }>;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  entityType: string;
  isRead: boolean;
  createdAt: string;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [smsData, setSmsData] = useState<SmsDashboardData | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    try {
      setRefreshing(true);
      const [dashRes, smsRes, notifRes] = await Promise.all([
        fetch("/api/panel/dashboard/summary"),
        fetch("/api/panel/monitoring/sms"),
        fetch("/api/panel/notifications?limit=5"),
      ]);

      if (dashRes.ok) {
        const json = await dashRes.json();
        if (json.ok && json.data) setData(json.data);
      }

      if (smsRes.ok) {
        const json = await smsRes.json();
        if (json.ok && json.data) setSmsData(json.data);
      }

      if (notifRes.ok) {
        const json = await notifRes.json();
        if (json.ok && json.data) setNotifications(json.data.notifications || []);
      }
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function formatNumber(val: number | undefined | null): string {
    if (val === undefined || val === null || isNaN(Number(val))) return "۰";
    return Number(val).toLocaleString("fa-IR");
  }

  function formatRials(amountStr: string | undefined): string {
    if (!amountStr) return "۰";
    try {
      const num = BigInt(amountStr);
      return num.toLocaleString("fa-IR");
    } catch {
      return amountStr;
    }
  }

  function formatToman(amountStr: string | undefined): string {
    if (!amountStr) return "۰";
    try {
      const num = BigInt(amountStr) / 10n;
      return num.toLocaleString("fa-IR");
    } catch {
      return "۰";
    }
  }

  // Phase color definitions
  const phaseColors: Record<string, { bg: string; text: string; border: string }> = {
    IMPORTED: { bg: "bg-zinc-100", text: "text-zinc-700", border: "border-zinc-200" },
    PDF_ATTACHED: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
    AWAITING_COMMITMENT: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" },
    AWAITING_PAYMENT: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    PAYMENT_UNDER_REVIEW: { bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-200" },
    PAYMENT_REJECTED: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
    RESIDUAL_PAYMENT: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
    REFUND_RECORDED: { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-200" },
    REFUND_SETTLED: { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
    READY_FOR_RELEASE: { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200" },
    RELEASED: { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" },
    COMPLETED: { bg: "bg-teal-50", text: "text-teal-800", border: "border-teal-200" },
    CANCELLED: { bg: "bg-zinc-200", text: "text-zinc-600", border: "border-zinc-300" },
    ARCHIVED: { bg: "bg-zinc-100", text: "text-zinc-500", border: "border-zinc-200" },
    NEEDS_ATTENTION: { bg: "bg-red-50", text: "text-red-700", border: "border-red-300" },
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-zinc-500 text-sm">در حال دریافت داده‌های زنده داشبورد...</p>
      </div>
    );
  }

  const kpis = data?.kpis;
  const phases = data?.phases;

  // Safe SMS calculations
  const dailyStats = smsData?.dailyStats;
  const sentToday = dailyStats?.sentToday ?? 0;
  const pendingToday = dailyStats?.pendingToday ?? 0;
  const usedToday = sentToday + pendingToday;
  const dailyCap = dailyStats?.dailyCap ?? 2000;
  const remainingToday = dailyStats?.remainingToday ?? Math.max(0, dailyCap - usedToday);
  const usagePercent = dailyStats?.usagePercent ?? (dailyCap > 0 ? Math.round((usedToday / dailyCap) * 100) : 0);
  const isWarningThreshold = dailyStats?.isWarningThreshold ?? (usedToday >= Math.floor(dailyCap * 0.8));
  const primaryProvider = smsData?.circuitBreaker?.primaryProvider ?? "FARAZSMS";

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">داشبورد عملیات و وضعیت مالی</h1>
          <p className="text-xs text-zinc-500 mt-1">
            آمار لحظه‌ای بارنامه‌ها، واریزی رانندگان و نظارت بر صف پیامک
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-xl hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>بروزرسانی داده‌ها</span>
          </button>
          <Link
            href="/driver/demo-driver-token"
            target="_blank"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-sm shadow-blue-600/20"
          >
            <span>مشاهده پورتال راننده</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Paid Amount */}
        <div className="p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-medium">کل واریزی‌های تایید شده</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-zinc-900 font-mono">
              {formatRials(kpis?.totalPaidAmount)} <span className="text-xs font-normal text-zinc-500 font-sans">ریال</span>
            </div>
            <div className="text-xs text-zinc-400 mt-1">
              معادل {formatToman(kpis?.totalPaidAmount)} تومان
            </div>
          </div>
        </div>

        {/* Today's Paid Amount */}
        <div className="p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-medium">واریزی‌های تایید شده امروز</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-zinc-900 font-mono">
              {formatRials(kpis?.todayPaidAmount)} <span className="text-xs font-normal text-zinc-500 font-sans">ریال</span>
            </div>
            <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>تسویه ۱۰۰٪ امن بانکی</span>
            </div>
          </div>
        </div>

        {/* Total Waybills */}
        <div className="p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-medium">کل بارنامه‌های ثبت‌شده</span>
            <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-zinc-900 font-mono">
              {formatNumber(kpis?.totalWaybills)} <span className="text-xs font-normal text-zinc-500 font-sans">فقره</span>
            </div>
            <div className="text-xs text-zinc-400 mt-1">
              {formatNumber(kpis?.releasedCount)} بارنامه ترخیص شده
            </div>
          </div>
        </div>

        {/* Pending Review & Stale SLA */}
        <div className="p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-medium">در انتظار بررسی متصدی</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              (kpis?.staleReviewsCount || 0) > 0 ? "bg-rose-50 text-rose-600" : "bg-purple-50 text-purple-600"
            }`}>
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-zinc-900 font-mono">
              {formatNumber(kpis?.pendingReviewsCount)} <span className="text-xs font-normal text-zinc-500 font-sans">مورد</span>
            </div>
            {(kpis?.staleReviewsCount || 0) > 0 ? (
              <div className="text-xs text-rose-600 font-medium mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{formatNumber(kpis?.staleReviewsCount)} مورد بیش از ۴ ساعت در صف</span>
              </div>
            ) : (
              <div className="text-xs text-emerald-600 mt-1">صف بررسی به‌روز است</div>
            )}
          </div>
        </div>
      </div>

      {/* 15-Phase Breakdown Grid */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">توزیع بارنامه‌ها در فازهای ۱۵ گانه</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              محاسبه زنده بر اساس ۵ محور وضعیت مستقل (طبق استاندارد معماری barnameh-pay)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {phases &&
            (Object.keys(WAYBILL_PHASE_LABELS) as WaybillPhase[]).map((phaseKey) => {
              const count = phases[phaseKey] || 0;
              const color = phaseColors[phaseKey] || phaseColors.IMPORTED;
              const label = WAYBILL_PHASE_LABELS[phaseKey];

              return (
                <div
                  key={phaseKey}
                  className={`p-3 rounded-xl border ${color.border} ${color.bg} flex flex-col justify-between transition-transform hover:scale-[1.02]`}
                >
                  <div className="text-[11px] font-medium text-zinc-600 truncate mb-2" title={label}>
                    {label}
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-zinc-400 font-mono">{phaseKey}</span>
                    <span className={`text-base font-bold font-mono ${count > 0 ? color.text : "text-zinc-400"}`}>
                      {formatNumber(count)}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* 2-Column: SMS Monitoring & Recent Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SMS Monitoring Meter (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              <h2 className="text-sm font-bold text-zinc-900">پایش مصرف پیامک و سقف روزانه</h2>
            </div>
            {isWarningThreshold && (
              <span className="px-2.5 py-1 bg-rose-100 text-rose-700 text-xs font-semibold rounded-full flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>مصرف بیش از ۸۰٪ سقف</span>
              </span>
            )}
          </div>

          {/* Daily Cap Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-600">
                مصرف امروز: <strong className="text-zinc-900 font-mono">{formatNumber(usedToday)}</strong> از <strong className="text-zinc-900 font-mono">{formatNumber(dailyCap)}</strong> پیامک
              </span>
              <span className="font-bold text-zinc-900 font-mono">{formatNumber(usagePercent)}%</span>
            </div>
            <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  usagePercent > 80
                    ? "bg-rose-500"
                    : usagePercent > 50
                    ? "bg-amber-500"
                    : "bg-blue-600"
                }`}
                style={{ width: `${Math.max(usagePercent, 2)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>سهمیه باقیمانده: {formatNumber(remainingToday)} پیامک</span>
              <span>پرووایدر فعال: {primaryProvider} (مدار سالم)</span>
            </div>
          </div>

          {/* Recent Failures with Persian reason */}
          <div>
            <h3 className="text-xs font-bold text-zinc-700 mb-2">پیامک‌های ناموفق نیازمند پیگیری تلفنی:</h3>
            {smsData?.recentFailures && smsData.recentFailures.length > 0 ? (
              <div className="space-y-2">
                {smsData.recentFailures.slice(0, 3).map((job) => (
                  <div
                    key={job.id}
                    className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold text-rose-900 font-mono">{job.recipient}</div>
                      <div className="text-zinc-600">{job.persianReason}</div>
                    </div>
                    <span className="px-2 py-0.5 bg-white text-rose-600 border border-rose-200 rounded text-[11px] flex-shrink-0">
                      تلاش: {job.attempts} بار
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-xl text-center text-xs text-zinc-500">
                هیچ پیامک ناموفقی ثبت نشده است.
              </div>
            )}
          </div>
        </div>

        {/* Notifications & System Alerts (1 col) */}
        <div id="notifications" className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-zinc-700" />
              <h2 className="text-sm font-bold text-zinc-900">رویدادها و اعلانات</h2>
            </div>
          </div>

          <div className="space-y-3">
            {notifications.length > 0 ? (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 rounded-xl border text-xs space-y-1 ${
                    !n.isRead ? "bg-blue-50/60 border-blue-100" : "bg-zinc-50 border-zinc-100"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-800">{n.title}</span>
                    <span className="text-[10px] text-zinc-400">
                      {new Date(n.createdAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-zinc-600 leading-relaxed">{n.message}</p>
                </div>
              ))
            ) : (
              <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-xl text-center text-xs text-zinc-500">
                اعلانی وجود ندارد.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
