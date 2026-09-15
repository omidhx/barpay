"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  MessageSquare,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  PhoneCall,
  Zap,
  RotateCcw,
  Activity,
} from "lucide-react";

interface CircuitBreakerItem {
  provider: string;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failureCount: number;
  lastFailureAt: string | null;
  cooldownRemainingSeconds: number;
}

interface FailedSmsJob {
  id: string;
  driverMobileMasked: string;
  recipientMobile: string;
  templateKey: string;
  waybillNumber: string | null;
  failureReason: string;
  attemptsCount: number;
  createdAt: string;
}

interface SmsDashboardData {
  dailyCap: number;
  todaySentCount: number;
  percentUsed: number;
  circuitBreakers: CircuitBreakerItem[];
  failedJobs: FailedSmsJob[];
}

export default function MonitoringPage() {
  const [data, setData] = useState<SmsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadMonitoring = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/panel/monitoring/sms");
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) {
          setData(json.data);
        }
      }
    } catch {
      setMessage({ type: "error", text: "خطا در دریافت وضعیت مانیتورینگ پیامک." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMonitoring();
  }, [loadMonitoring]);

  const handleRetryJob = async (jobId: string) => {
    setRetryingId(jobId);
    setMessage(null);
    try {
      const res = await fetch(`/api/panel/monitoring/sms/jobs/${jobId}/retry`, {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage({ type: "success", text: "درخواست ارسال مجدد پیامک با موفقیت در صف پردازش قرار گرفت." });
        loadMonitoring();
      } else {
        setMessage({ type: "error", text: json.message || "خطا در تلاش مجدد ارسال پیامک." });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    } finally {
      setRetryingId(null);
    }
  };

  const handlePhoneFollowup = (job: FailedSmsJob) => {
    const contact = job.recipientMobile || job.driverMobileMasked;
    window.alert(`پیگیری تلفنی متصدی برای بارنامه ${job.waybillNumber || "نامشخص"}:\nشماره راننده: ${contact}\n\nلطفاً با راننده تماس گرفته و لینک را به صورت تلفنی یا پیامک دستی اعلام فرمایید.`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">مرکز مانیتورینگ خطوط و پیامک‌های ارسالی</h1>
          <p className="text-xs text-zinc-500 mt-1">
            پایش لحظه‌ای مصرف سهمیه ۲۰۰۰ پیامک روزانه، وضعیت مدارشکن ارائه‌دهندگان و مدیریت خطاهای مخابراتی
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadMonitoring}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-xl hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>بروزرسانی داده‌ها</span>
          </button>
        </div>
      </div>

      {/* Message Banner */}
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

      {/* Quota & Circuit Breakers Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Quota Card */}
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              <span>سهمیه روزانه پیامک سازمان</span>
            </h2>
            <span className="text-xs font-mono font-bold text-zinc-700">
              {data?.dailyCap.toLocaleString("fa-IR") || "۲٬۰۰۰"} پیامک
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">مصرف امروز:</span>
              <span className="font-bold font-mono text-zinc-900">
                {data?.todaySentCount.toLocaleString("fa-IR") || "۰"} عدد ({data?.percentUsed || 0}٪)
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  (data?.percentUsed || 0) > 90
                    ? "bg-rose-500"
                    : (data?.percentUsed || 0) > 75
                    ? "bg-amber-500"
                    : "bg-blue-600"
                }`}
                style={{ width: `${Math.min(100, data?.percentUsed || 0)}%` }}
              />
            </div>

            <div className="flex justify-between text-[11px] text-zinc-400 pt-1">
              <span>شروع: ۰۰:۰۰ بامداد</span>
              <span>ریست سهمیه در پایان روز</span>
            </div>
          </div>

          {(data?.percentUsed || 0) >= 80 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>هشدار: بیش از ۸۰٪ سهمیه روزانه مصرف شده است.</span>
            </div>
          )}
        </div>

        {/* Circuit Breakers Status (Spans 2 cols) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <span>وضعیت سلامت و مدارشکن خطوط (Circuit Breakers)</span>
            </h2>
            <span className="text-[11px] text-zinc-400">سوییچ هوشمند بین خطوط</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {data?.circuitBreakers && data.circuitBreakers.length > 0 ? (
              data.circuitBreakers.map((cb) => (
                <div key={cb.provider} className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-800">{cb.provider}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        cb.state === "CLOSED"
                          ? "bg-emerald-100 text-emerald-800"
                          : cb.state === "OPEN"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {cb.state === "CLOSED" ? "سالم (CLOSED)" : cb.state === "OPEN" ? "قطع موقت (OPEN)" : "آزمایشی (HALF)"}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    خطاهای متوالی: <strong className="font-mono text-zinc-700">{cb.failureCount}</strong>
                  </div>
                  {cb.cooldownRemainingSeconds > 0 && (
                    <div className="text-[10px] text-amber-700 font-mono">
                      تلاش مجدد تا {cb.cooldownRemainingSeconds} ثانیه دیگر
                    </div>
                  )}
                </div>
              ))
            ) : (
              <>
                <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-800">کاوه‌نگار (Kavenegar)</span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                      سالم (CLOSED)
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500">خط اصلی سرویس پیامک OTP و اطلاع‌رسانی</p>
                </div>
                <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-800">فراز اس‌ام‌اس (FarazSMS)</span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                      آماده‌باش (STANDBY)
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500">خط پشتیبان در زمان بروز خطای سرویس اصلی</p>
                </div>
                <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-800">ملی‌پیامک (MelliPayamak)</span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                      آماده‌باش (STANDBY)
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500">پشتیبان سطح دوم و ارسال بلک‌لیست مخابرات</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Failed SMS Queue Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-rose-600" />
            <h2 className="text-sm font-bold text-zinc-900">صف پیامک‌های ناموفق و نیازمند پیگیری</h2>
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            {data?.failedJobs.length || 0} مورد
          </span>
        </div>

        {data?.failedJobs && data.failedJobs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-zinc-50 text-zinc-600 border-b border-zinc-200">
                <tr>
                  <th className="p-3.5 font-semibold">شماره بارنامه</th>
                  <th className="p-3.5 font-semibold">شماره گیرنده</th>
                  <th className="p-3.5 font-semibold">نوع پیامک</th>
                  <th className="p-3.5 font-semibold">علت شفاف عدم ارسال</th>
                  <th className="p-3.5 font-semibold">تعداد تلاش</th>
                  <th className="p-3.5 font-semibold text-center">اقدامات متصدی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {data.failedJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-zinc-50/70">
                    <td className="p-3.5 font-bold font-mono text-zinc-900">
                      {job.waybillNumber || "—"}
                    </td>
                    <td className="p-3.5 font-mono text-zinc-700">
                      {job.driverMobileMasked}
                    </td>
                    <td className="p-3.5 text-zinc-600">{job.templateKey}</td>
                    <td className="p-3.5 text-rose-700 font-medium">
                      {job.failureReason}
                    </td>
                    <td className="p-3.5 font-mono text-zinc-700">
                      {job.attemptsCount} بار
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleRetryJob(job.id)}
                          disabled={retryingId === job.id}
                          className="px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors"
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${retryingId === job.id ? "animate-spin" : ""}`} />
                          <span>ارسال مجدد</span>
                        </button>
                        <button
                          onClick={() => handlePhoneFollowup(job)}
                          className="px-2.5 py-1.5 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span>پیگیری تلفنی</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center text-zinc-400 text-xs space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="font-semibold text-zinc-700">همه پیامک‌ها با موفقیت مخابره شده‌اند.</p>
            <p className="text-zinc-400">هیچ پیامک ناموفق یا معلقی در صف پیگیری وجود ندارد.</p>
          </div>
        )}
      </div>
    </div>
  );
}
