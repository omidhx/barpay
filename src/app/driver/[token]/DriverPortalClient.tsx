"use client";

import React, { useState, useRef, useEffect } from "react";
import { VerifyDriverAccessLinkResult } from "@/modules/auth/driver-auth";

export interface WaybillViewData {
  id: string;
  waybillNumber: string;
  driverName: string;
  driverMobile: string;
  origin?: string | null;
  destination?: string | null;
  payableAmount: string;
  shipmentStatus: string;
  commitmentStatus: string;
  paymentStatus: string;
  commitmentText?: string | null;
  enforcementMode: "OFF" | "SHADOW" | "ENFORCED";
}

interface Props {
  token: string;
  linkData: VerifyDriverAccessLinkResult;
  waybillData?: WaybillViewData | null;
  initialSessionActive: boolean;
}

export function DriverPortalClient({
  token,
  linkData,
  waybillData,
  initialSessionActive,
}: Props) {
  const [isAuthenticated, setIsAuthenticated] = useState(initialSessionActive);
  const [waybill, setWaybill] = useState<WaybillViewData | null>(waybillData ?? null);

  // OTP State
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpTimer, setOtpTimer] = useState(0);
  const [otpLoading, setOtpLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Commitment & Signature State
  const [isSigning, setIsSigning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);

  // Countdown timer for OTP
  useEffect(() => {
    if (otpTimer <= 0) return;
    const interval = setInterval(() => {
      setOtpTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [otpTimer]);

  // Request OTP
  const handleRequestOtp = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setOtpLoading(true);

    try {
      const res = await fetch("/api/driver/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "خطا در ارسال کد اعتبارسنجی");
      }

      setOtpSent(true);
      setOtpTimer(180); // 3 minutes
      setSuccessMsg(`کد اعتبارسنجی با موفقیت به شماره ${data.maskedMobile} ارسال شد.`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "خطا در برقراری ارتباط با سرور");
    } finally {
      setOtpLoading(false);
    }
  };

  // Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length !== 6) {
      setErrorMsg("لطفاً کد ۶ رقمی را به‌طور کامل وارد فرمایید.");
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setOtpLoading(true);

    try {
      const res = await fetch("/api/driver/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code: otpCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "کد اعتبارسنجی نادرست است.");
      }

      setIsAuthenticated(true);
      setSuccessMsg("ورود موفقیت‌آمیز بود. در حال بارگذاری اطلاعات بارنامه...");
      window.location.reload(); // Refresh to load server data
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "خطا در تایید کد");
    } finally {
      setOtpLoading(false);
    }
  };

  // Canvas Drawing Handlers
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsSigning(true);
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isSigning) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e293b";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    setIsSigning(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  // Accept Commitment
  const handleAcceptCommitment = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) {
      setErrorMsg("لطفاً ابتدا امضای خود را در کادر مربوطه ترسیم فرمایید.");
      return;
    }

    const signatureBase64 = canvas.toDataURL("image/png");
    setCommitLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/driver/commitment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ACCEPT", signatureBase64 }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "خطا در ثبت تعهدنامه");
      }

      setSuccessMsg("اقرار الکترونیکی و تعهدنامه شما با موفقیت ثبت شد.");
      if (waybill) {
        setWaybill({ ...waybill, commitmentStatus: "ACCEPTED" });
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "خطا در ثبت تعهدنامه");
    } finally {
      setCommitLoading(false);
    }
  };

  // Decline Commitment
  const handleDeclineCommitment = async () => {
    const confirmed = window.confirm(
      "آیا مطمئن هستید که می‌خواهید تعهدنامه را رد نمایید؟ در این صورت فرایند متوقف شده و به متصدی شرکت اطلاع داده می‌شود."
    );
    if (!confirmed) return;

    setCommitLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/driver/commitment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DECLINE",
          reason: "راننده با شرایط و مبالغ تعهدنامه مخالفت نمود.",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "خطا در ثبت مخالفت");
      }

      if (waybill) {
        setWaybill({ ...waybill, commitmentStatus: "DECLINED" });
      }
      setSuccessMsg("مخالفت شما با متن تعهدنامه ثبت و به متصدی شرکت ترابری اعلام گردید.");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "خطا در ثبت مخالفت");
    } finally {
      setCommitLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-6" dir="rtl">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header Branding */}
        <header className="text-center space-y-1 py-4 border-b border-slate-200">
          <div className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
            سامانه رسمی پرداخت بارنامه‌پی
          </div>
          <h1 className="text-xl font-bold text-slate-900">{linkData.organizationName}</h1>
          <p className="text-xs text-slate-500">شماره بارنامه: {linkData.waybillNumber}</p>
        </header>

        {/* Global Alerts */}
        {errorMsg && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl">
            {successMsg}
          </div>
        )}

        {/* VIEW 1: PRE-AUTH (OTP LOGIN) */}
        {!isAuthenticated && (
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-5">
            <div className="space-y-2 text-center">
              <h2 className="text-lg font-bold text-slate-900">احراز هویت راننده</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                جهت مشاهده مشخصات مالی، تعهدنامه و پرداخت کرایه بارنامه، کد اعتبارسنجی را به شماره تلفن همراه{" "}
                <strong className="font-semibold text-slate-900">{linkData.maskedMobile}</strong> دریافت فرمایید.
              </p>
            </div>

            {!otpSent ? (
              <button
                type="button"
                onClick={handleRequestOtp}
                disabled={otpLoading}
                className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-base shadow-sm transition active:scale-[0.98] flex items-center justify-center"
              >
                {otpLoading ? "در حال ارسال پیامک..." : "دریافت کد اعتبارسنجی پیامکی"}
              </button>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2 text-center">
                    کد ۶ رقمی ارسال‌شده را وارد فرمایید
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="— — — — — —"
                    className="w-full h-14 text-center text-2xl font-bold tracking-widest border-2 border-blue-200 focus:border-blue-600 rounded-xl outline-none transition"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={otpLoading || otpCode.length !== 6}
                  className="w-full h-14 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-base shadow-sm transition active:scale-[0.98]"
                >
                  {otpLoading ? "در حال بررسی..." : "تأیید و ورود به بارنامه"}
                </button>

                <div className="flex justify-between items-center text-xs text-slate-500 pt-2">
                  <span>
                    {otpTimer > 0 ? (
                      `ارسال مجدد تا ${Math.floor(otpTimer / 60)}:${String(otpTimer % 60).padStart(2, "0")}`
                    ) : (
                      <button
                        type="button"
                        onClick={handleRequestOtp}
                        className="text-blue-600 hover:underline font-semibold"
                      >
                        ارسال دوباره کد
                      </button>
                    )}
                  </span>
                  <span>راننده: {linkData.driverName}</span>
                </div>
              </form>
            )}
          </section>
        )}

        {/* VIEW 2: POST-AUTH DRIVER PORTAL */}
        {isAuthenticated && waybill && (
          <main className="space-y-6">
            {/* Step 1: Waybill Info Card */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <span className="text-xs font-bold text-slate-500">گام ۱: مشخصات بارنامه</span>
                <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-semibold">
                  احراز هویت شده
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-slate-400 block mb-1">نام راننده</span>
                  <span className="font-bold text-slate-800">{waybill.driverName}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-slate-400 block mb-1">شماره بارنامه</span>
                  <span className="font-bold text-slate-800">{waybill.waybillNumber}</span>
                </div>
                {waybill.origin && (
                  <div className="bg-slate-50 p-3 rounded-xl">
                    <span className="text-slate-400 block mb-1">مبدأ</span>
                    <span className="font-bold text-slate-800">{waybill.origin}</span>
                  </div>
                )}
                {waybill.destination && (
                  <div className="bg-slate-50 p-3 rounded-xl">
                    <span className="text-slate-400 block mb-1">مقصد</span>
                    <span className="font-bold text-slate-800">{waybill.destination}</span>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex justify-between items-center">
                <span className="text-xs font-bold text-blue-900">مبلغ قابل پرداخت راننده:</span>
                <span className="text-lg font-extrabold text-blue-900">
                  {Number(waybill.payableAmount).toLocaleString("fa-IR")}{" "}
                  <span className="text-xs font-normal">ریال</span>
                </span>
              </div>
            </div>

            {/* Step 2: Commitment & Drawing Signature (Decision 19) */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <span className="text-xs font-bold text-slate-500">گام ۲: اقرار الکترونیکی و تعهدنامه</span>
                {waybill.commitmentStatus === "ACCEPTED" ? (
                  <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-semibold">
                    تأیید و امضا شده
                  </span>
                ) : waybill.commitmentStatus === "DECLINED" ? (
                  <span className="text-xs bg-red-100 text-red-800 px-2.5 py-0.5 rounded-full font-semibold">
                    رد شده توسط راننده
                  </span>
                ) : (
                  <span className="text-xs bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full font-semibold">
                    در انتظار پذیرش و امضا
                  </span>
                )}
              </div>

              {/* Rendered Legal Commitment Body */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 leading-relaxed max-h-48 overflow-y-auto">
                {waybill.commitmentText || "متن رسمی تعهدنامه برای این بارنامه در دسترس است."}
              </div>

              {waybill.commitmentStatus === "ACCEPTED" ? (
                <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-xl flex items-center justify-center font-semibold">
                  ✓ تعهدنامه الکترونیکی با شماره تلفن همراه شما ثبت و امضا شده است.
                </div>
              ) : waybill.commitmentStatus === "DECLINED" ? (
                <div className="p-3 bg-red-50 text-red-800 text-xs rounded-xl">
                  تعهدنامه توسط شما رد شده است. جهت هماهنگی و بررسی بارنامه با شرکت ترابری تماس حاصل فرمایید.
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-700">امضای خود را ترسیم فرمایید:</label>
                      <button
                        type="button"
                        onClick={clearCanvas}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        پاک کردن
                      </button>
                    </div>
                    <div className="border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-white touch-none">
                      <canvas
                        ref={canvasRef}
                        width={360}
                        height={160}
                        className="w-full h-40 cursor-crosshair block"
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 text-center">
                      امضای ترسیمی شما به‌همراه هویت تأییدشده پیامکی به‌عنوان سند اقرار الکترونیکی ذخیره خواهد شد.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleAcceptCommitment}
                      disabled={commitLoading || !hasDrawn}
                      className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-base shadow-sm transition active:scale-[0.98]"
                    >
                      {commitLoading ? "در حال ثبت اقرار..." : "اقرار و تأیید تعهدنامه"}
                    </button>

                    <button
                      type="button"
                      onClick={handleDeclineCommitment}
                      disabled={commitLoading}
                      className="w-full h-12 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
                    >
                      مخالفم؛ تماس بگیرید
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Step 3: Payment (Unlocked after commitment) */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <span className="text-xs font-bold text-slate-500">گام ۳: پرداخت وجه کرایه</span>
                <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-semibold">
                  {waybill.paymentStatus === "APPROVED"
                    ? "تسویه شده"
                    : waybill.paymentStatus === "SUBMITTED"
                    ? "در حال بررسی پرداخت"
                    : "آماده پرداخت"}
                </span>
              </div>

              {waybill.commitmentStatus !== "ACCEPTED" ? (
                <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl leading-relaxed">
                  طبق ضوابط شرکت، ابتدا باید گام ۲ (مطالعه و اقرار تعهدنامه) تکمیل و امضا شود تا درگاه و روش‌های پرداخت فعال گردند.
                </div>
              ) : waybill.paymentStatus === "APPROVED" ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-semibold text-center">
                  پرداخت شما با موفقیت تأیید شده است. بارنامه آماده دانلود است.
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">
                    تعهدنامه با موفقیت تأیید شد. اکنون می‌توانید روش پرداخت مورد نظر خود را انتخاب فرمایید:
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      className="h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition"
                    >
                      پرداخت آنلاین (درگاه)
                    </button>
                    <button
                      type="button"
                      className="h-14 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-sm transition"
                    >
                      کارت‌به‌کارت شرکتی
                    </button>
                  </div>
                </div>
              )}
            </div>
          </main>
        )}

        {/* Footer Support */}
        <footer className="text-center text-xs text-slate-400 py-4">
          نیاز به راهنمایی دارید؟ تماس با پشتیبانی: <span className="font-semibold text-slate-600">۰۲۱-۸۸۸۸۸۸۸۸</span>
        </footer>
      </div>
    </div>
  );
}
