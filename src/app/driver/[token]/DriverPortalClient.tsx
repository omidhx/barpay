"use client";

import React, { useState, useRef, useEffect } from "react";
import { VerifyDriverAccessLinkResult } from "@/modules/auth/driver-auth";
import { DriverCardDisplay } from "@/modules/payments/cards/bank-card-service";

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
  releaseStatus?: string;
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

  // Payment State
  const [paymentTab, setPaymentTab] = useState<"GATEWAY" | "CARD_TO_CARD">("GATEWAY");
  const [bankCards, setBankCards] = useState<DriverCardDisplay[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [trackingNumber, setTrackingNumber] = useState<string>("");
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [copiedCardId, setCopiedCardId] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState<boolean>(false);

  // Handle URL callback parameters on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment_status");
    const ref = params.get("ref");

    if (paymentStatus === "VERIFIED" || paymentStatus === "ALREADY_VERIFIED") {
      setSuccessMsg(`پرداخت آنلاین شما با موفقیت انجام و تأیید گردید. شماره پیگیری: ${ref || "ثبت‌شده"}`);
      if (waybill) {
        setWaybill({ ...waybill, paymentStatus: "APPROVED" });
      }
    } else if (paymentStatus === "FAILED") {
      setErrorMsg("پرداخت آنلاین توسط درگاه بانکی تأیید نگردید یا توسط کاربر لغو شد.");
    } else if (paymentStatus === "UNKNOWN") {
      setErrorMsg("نتیجه تراکنش درگاه هنوز نامشخص است و در حال بررسی دوره‌ای سیستم می‌باشد.");
    }
  }, [waybill]);

  // Load Bank Cards when authenticated and commitment accepted
  useEffect(() => {
    if (!isAuthenticated || waybill?.commitmentStatus !== "ACCEPTED") return;

    fetch("/api/driver/payment/cards")
      .then((res) => res.json())
      .then((res) => {
        if (res.ok && res.data?.cards) {
          setBankCards(res.data.cards);
          if (res.data.cards.length > 0) {
            setSelectedCardId(res.data.cards[0].id);
          }
        }
      })
      .catch(() => {});
  }, [isAuthenticated, waybill?.commitmentStatus]);

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
        throw new Error(data.error?.humanMessage || data.error || "کد واردشده نادرست است.");
      }

      setIsAuthenticated(true);
      setSuccessMsg("احراز هویت با موفقیت انجام شد.");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "خطا در بررسی کد");
    } finally {
      setOtpLoading(false);
    }
  };

  // Canvas Drawing Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsSigning(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isSigning) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000000";
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
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
    if (!hasDrawn || !canvasRef.current) {
      setErrorMsg("لطفاً ابتدا امضای خود را در کادر مربوطه رسم فرمایید.");
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setCommitLoading(true);

    try {
      const signatureDataUrl = canvasRef.current.toDataURL("image/png");

      const res = await fetch("/api/driver/commitment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ACCEPT",
          signatureDataUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.humanMessage || data.error || "خطا در ثبت تعهدنامه");
      }

      setSuccessMsg("اقرار و تعهدنامه شما با موفقیت ثبت گردید. اکنون می‌توانید پرداخت را انجام دهید.");
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
    const reason = window.prompt("لطفاً دلیل عدم پذیرش تعهدنامه را وارد فرمایید (اختیاری):") || undefined;

    setErrorMsg(null);
    setSuccessMsg(null);
    setCommitLoading(true);

    try {
      const res = await fetch("/api/driver/commitment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DECLINE",
          reason,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.humanMessage || data.error || "خطا در ثبت عدم پذیرش");
      }

      setErrorMsg("عدم پذیرش تعهدنامه ثبت شد. دسترسی به پرداخت مسدود گردید. با شرکت تماس بگیرید.");
      if (waybill) {
        setWaybill({ ...waybill, commitmentStatus: "DECLINED" });
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "خطا در ثبت");
    } finally {
      setCommitLoading(false);
    }
  };

  // Initiate Online Gateway Payment
  const handleInitiateGateway = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setPaymentLoading(true);

    try {
      const res = await fetch("/api/driver/payment/gateway/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkToken: token }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error?.humanMessage || "خطا در اتصال به درگاه پرداخت");
      }

      const { redirect } = data.data;

      if (redirect.method === "GET") {
        window.location.href = redirect.url;
      } else {
        // Build and submit form for POST redirect
        const form = document.createElement("form");
        form.method = "POST";
        form.action = redirect.url;

        if (redirect.formFields) {
          Object.entries(redirect.formFields).forEach(([key, val]) => {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = key;
            input.value = String(val);
            form.appendChild(input);
          });
        }

        document.body.appendChild(form);
        form.submit();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "خطا در انتقال به درگاه پرداخت");
      setPaymentLoading(false);
    }
  };

  // Handle Receipt File Upload
  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("حجم تصویر رسید نمی‌تواند بیش از ۵ مگابایت باشد.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setReceiptImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Submit Card-to-Card Payment
  const handleSubmitCardToCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCardId) {
      setErrorMsg("لطفاً کارت بانکی مقصد را انتخاب فرمایید.");
      return;
    }

    if (!trackingNumber && !receiptImage) {
      setErrorMsg("لطفاً حداقل شماره پیگیری یا تصویر رسید پرداخت را وارد فرمایید.");
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setPaymentLoading(true);

    try {
      const res = await fetch("/api/driver/payment/card-to-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutCardId: selectedCardId,
          trackingNumber: trackingNumber || undefined,
          receiptImageBase64: receiptImage || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error?.humanMessage || "خطا در ثبت رسید پرداخت");
      }

      setSuccessMsg("رسید پرداخت شما با موفقیت ثبت شد و در صف بررسی متصدی قرار گرفت.");
      if (waybill) {
        setWaybill({ ...waybill, paymentStatus: "SUBMITTED" });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "خطا در ثبت پرداخت کارت‌به‌کارت");
    } finally {
      setPaymentLoading(false);
    }
  };

  // Copy card number to clipboard
  const handleCopyCard = (cardId: string, cardNumber: string) => {
    navigator.clipboard.writeText(cardNumber);
    setCopiedCardId(cardId);
    setTimeout(() => {
      setCopiedCardId(null);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-6" dir="rtl">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header Branding */}
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-black text-blue-700 tracking-tight">بارنامه‌پی</h1>
          <p className="text-xs text-slate-500">{linkData.organizationName}</p>
        </header>

        {/* Global Notifications */}
        {errorMsg && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs font-semibold leading-relaxed animate-in fade-in">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold leading-relaxed animate-in fade-in">
            {successMsg}
          </div>
        )}

        {/* =================================================================== */}
        {/* Step 1: Authentication View (When not authenticated)                */}
        {/* =================================================================== */}
        {!isAuthenticated ? (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-5">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                📱
              </div>
              <h2 className="text-base font-bold text-slate-900">ورود امن راننده</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                جهت مشاهده بارنامه و تسویه کرایه، کد اعتبارسنجی پیامک‌شده به شماره موبایل خود را وارد نمایید.
              </p>
            </div>

            {!otpSent ? (
              <button
                type="button"
                onClick={handleRequestOtp}
                disabled={otpLoading}
                className="w-full h-14 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-base shadow-sm transition active:scale-[0.98]"
              >
                {otpLoading ? "در حال ارسال پیامک..." : "ارسال کد تأیید ۶ رقمی"}
              </button>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="otp" className="text-xs font-bold text-slate-700 block">
                    کد تأیید ۶ رقمی:
                  </label>
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="— — — — — —"
                    className="w-full h-14 text-center text-2xl font-mono tracking-widest border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                    autoFocus
                  />
                </div>

                {token === "demo-driver-token" && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-center space-y-1.5">
                    <span className="text-[11px] text-blue-800 font-bold block">
                      کد تایید تستی این بارنامه: <span className="font-mono text-base text-blue-950 font-black">۱۲۳۴۵۶</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setOtpCode("123456")}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                    >
                      درج خودکار کد ۱۲۳۴۵۶
                    </button>
                  </div>
                )}

                <div className="flex justify-between items-center text-xs text-slate-500">
                  {otpTimer > 0 ? (
                    <span>
                      ارسال مجدد کد پس از:{" "}
                      <span className="font-bold text-slate-700">
                        {Math.floor(otpTimer / 60)}:{(otpTimer % 60).toString().padStart(2, "0")}
                      </span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRequestOtp}
                      disabled={otpLoading}
                      className="text-blue-600 hover:underline font-semibold"
                    >
                      ارسال مجدد کد پیامکی
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={otpLoading || otpCode.length !== 6}
                  className="w-full h-14 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-base shadow-sm transition active:scale-[0.98]"
                >
                  {otpLoading ? "در حال بررسی کد..." : "تأیید و ورود"}
                </button>
              </form>
            )}
          </div>
        ) : (
          /* =================================================================== */
          /* Main Workflow: Waybill Details -> Commitment -> Payment (Decision 19)*/
          /* =================================================================== */
          waybill && (
            <main className="space-y-4">
              {/* Waybill Summary Card */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
                <div className="flex justify-between items-center border-b pb-3">
                  <span className="text-xs font-bold text-slate-500">مشخصات بارنامه</span>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full font-semibold">
                    {waybill.driverName}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
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

              {/* =================================================================== */}
              {/* Step 3: Payment (Decision 20 & Decision 21)                         */}
              {/* =================================================================== */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
                <div className="flex justify-between items-center border-b pb-3">
                  <span className="text-xs font-bold text-slate-500">گام ۳: پرداخت کرایه</span>
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
                    پرداخت شما با موفقیت تأیید شده است. بارنامه آماده آزادسازی و دریافت می‌باشد.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Method Tabs */}
                    <div className="flex rounded-xl bg-slate-100 p-1">
                      <button
                        type="button"
                        onClick={() => setPaymentTab("GATEWAY")}
                        className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition ${
                          paymentTab === "GATEWAY"
                            ? "bg-white text-blue-700 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        درگاه پرداخت آنلاین شتاب
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentTab("CARD_TO_CARD")}
                        className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition ${
                          paymentTab === "CARD_TO_CARD"
                            ? "bg-white text-blue-700 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        کارت به کارت شرکتی
                      </button>
                    </div>

                    {/* Tab 1: Online Gateway */}
                    {paymentTab === "GATEWAY" && (
                      <div className="space-y-4 pt-1">
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs text-slate-600">
                          <p>
                            با انتخاب این گزینه به درگاه پرداخت رسمی شاپرک متصل خواهید شد.
                          </p>
                          <p className="font-semibold text-slate-800">
                            مبلغ قابل پرداخت: {Number(waybill.payableAmount).toLocaleString("fa-IR")} ریال
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={handleInitiateGateway}
                          disabled={paymentLoading}
                          className="w-full h-14 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-base shadow-sm transition active:scale-[0.98]"
                        >
                          {paymentLoading ? "در حال اتصال به درگاه..." : "اتصال به درگاه و پرداخت"}
                        </button>
                      </div>
                    )}

                    {/* Tab 2: Graphical Bank Cards & Manual Form */}
                    {paymentTab === "CARD_TO_CARD" && (
                      <form onSubmit={handleSubmitCardToCard} className="space-y-4 pt-1">
                        {/* Graphical Bank Cards Display */}
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-700 block">
                            کارت مقصد واریز را انتخاب نمایید:
                          </label>

                          {bankCards.length === 0 ? (
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 text-center">
                              در حال حاضر کارت بانکی فعال برای سازمان تعریف نشده است.
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              {bankCards.map((card) => {
                                const isSelected = selectedCardId === card.id;
                                return (
                                  <div
                                    key={card.id}
                                    onClick={() => setSelectedCardId(card.id)}
                                    className={`relative p-4 rounded-xl cursor-pointer border transition ${
                                      isSelected
                                        ? "bg-gradient-to-br from-slate-900 to-slate-800 text-white border-blue-600 shadow-md"
                                        : "bg-white text-slate-800 border-slate-200 hover:border-slate-300"
                                    }`}
                                  >
                                    <div className="flex justify-between items-center mb-3">
                                      <span className="text-xs font-bold">{card.bankName}</span>
                                      <span className="text-[11px] opacity-75">{card.holderFullName}</span>
                                    </div>

                                    {/* 16-Digit Card Number with Copy Button */}
                                    <div className="flex items-center justify-between font-mono text-base tracking-wider direction-ltr my-2">
                                      <span>{card.cardNumberFormatted}</span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCopyCard(card.id, card.cardNumberRaw);
                                        }}
                                        className="text-[10px] font-sans bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg transition"
                                      >
                                        {copiedCardId === card.id ? "کپی شد ✓" : "کپی شماره"}
                                      </button>
                                    </div>

                                    <div className="text-[10px] opacity-70 mt-2">
                                      شبا: {card.ibanFormatted}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Tracking Number Input */}
                        <div className="space-y-1">
                          <label htmlFor="tracking" className="text-xs font-bold text-slate-700 block">
                            شماره پیگیری / مرجع تراکنش:
                          </label>
                          <input
                            id="tracking"
                            type="text"
                            value={trackingNumber}
                            onChange={(e) => setTrackingNumber(e.target.value)}
                            placeholder="مثال: ۱۲۳۴۵۶"
                            className="w-full h-12 px-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                          />
                        </div>

                        {/* Receipt Upload */}
                        <div className="space-y-1">
                          <label htmlFor="receipt" className="text-xs font-bold text-slate-700 block">
                            تصویر رسید پرداخت (اختیاری یا طبق ضوابط):
                          </label>
                          <input
                            id="receipt"
                            type="file"
                            accept="image/png, image/jpeg, image/jpg"
                            onChange={handleReceiptFileChange}
                            className="w-full text-xs text-slate-500 file:mr-0 file:ml-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                          />
                          {receiptImage && (
                            <p className="text-[10px] text-emerald-600">تصویر رسید با موفقیت انتخاب شد.</p>
                          )}
                        </div>

                        <button
                          type="submit"
                          disabled={paymentLoading || !selectedCardId}
                          className="w-full h-14 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold rounded-xl text-base shadow-sm transition active:scale-[0.98]"
                        >
                          {paymentLoading ? "در حال ثبت پرداخت..." : "پرداخت کردم و ثبت رسید"}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>

              {/* Step 4: Waybill Download (Decision 19 & Process 6.7) */}
              {(waybill.paymentStatus === "APPROVED" || waybill.releaseStatus === "RELEASED" || waybill.releaseStatus === "AUTHORIZED") && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
                  <div className="flex justify-between items-center border-b pb-3">
                    <span className="text-xs font-bold text-slate-500">گام ۴: دریافت نسخه نهایی بارنامه</span>
                    <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-semibold">
                      آماده تحویل
                    </span>
                  </div>

                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 leading-relaxed">
                    پرداخت و اقرار الکترونیکی شما با موفقیت تأیید گردید. اکنون می‌توانید فایل رسمی PDF بارنامه را دانلود و در دستگاه خود ذخیره فرمایید.
                  </div>

                  <a
                    href={`/api/driver/download/${token}`}
                    download
                    className="flex items-center justify-center gap-2 w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-base shadow-md transition active:scale-[0.98]"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    دریافت و دانلود فایل PDF بارنامه
                  </a>
                </div>
              )}

              {/* In-review notice */}
              {(waybill.paymentStatus === "SUBMITTED" || waybill.paymentStatus === "UNDER_REVIEW") && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-3">
                  <div className="flex justify-between items-center border-b pb-3">
                    <span className="text-xs font-bold text-slate-500">وضعیت بررسی پرداخت</span>
                    <span className="text-xs bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full font-semibold">
                      در صف بررسی
                    </span>
                  </div>
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
                    پرداخت شما ثبت شده و در صف بررسی متصدی قرار دارد. به محض تأیید مالی، امکان دریافت فایل بارنامه فعال خواهد شد.
                  </div>
                </div>
              )}
            </main>
          )
        )}

        {/* Footer Support */}
        <footer className="text-center text-xs text-slate-400 py-4">
          نیاز به راهنمایی دارید؟ تماس با پشتیبانی: <span className="font-semibold text-slate-600">۰۲۱-۸۸۸۸۸۸۸۸</span>
        </footer>
      </div>
    </div>
  );
}
