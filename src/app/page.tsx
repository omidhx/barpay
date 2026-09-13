import React from "react";
import Link from "next/link";
import {
  Truck,
  ShieldCheck,
  CreditCard,
  FileCheck,
  FileSpreadsheet,
  ArrowLeft,
  Lock,
  Layers,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 via-white to-zinc-100 text-zinc-900 flex flex-col justify-between">
      {/* Navigation Header */}
      <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <div className="font-bold text-lg text-zinc-900">بارنامه‌پی (barnameh-pay)</div>
            <div className="text-xs text-zinc-500">سامانه مدیریت بارنامه و پرداخت راننده</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-xs font-semibold text-zinc-700 hover:text-blue-600 transition-colors"
          >
            پنل مدیریت
          </Link>
          <Link
            href="/reports"
            className="text-xs font-semibold text-zinc-700 hover:text-blue-600 transition-colors"
          >
            گزارش‌های مالی
          </Link>
          <Link
            href="/driver/demo-driver-token"
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold rounded-lg border border-blue-200 transition-colors"
          >
            <span>پورتال راننده (دمو)</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="w-full max-w-5xl mx-auto px-6 py-12 text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>نسخه ۲.۵ پیاده‌سازی شده و پایگاه داده با موفقیت لود گردید</span>
        </div>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-zinc-900 tracking-tight leading-tight">
          مدیریت هوشمند بارنامه، تعهد الکترونیک
          <br />
          <span className="text-blue-600">و تسویه ریالی رانندگان سراسر کشور</span>
        </h1>

        <p className="text-sm sm:text-base text-zinc-600 max-w-2xl mx-auto leading-relaxed">
          سامانه اختصاصی شرکت‌های حمل‌ونقل با تطبیق دقیق ۱ به ۱ فایل‌های اکسل و PDF بارنامه، احراز
          هویت با پیامک یک‌بار مصرف، امضای حقوقی تعهد تحویل بار، اتصال به ۶ درگاه پرداخت شتابی و
          آزادسازی با رمزنگاری اختصاصی.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/25 transition-all hover:scale-[1.02]"
          >
            <span>ورود به پنل مدیریت (داشبورد عملیاتی)</span>
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <Link
            href="/driver/demo-driver-token"
            target="_blank"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-white hover:bg-zinc-50 text-zinc-800 font-bold text-sm rounded-xl border border-zinc-300 shadow-sm transition-all hover:scale-[1.02]"
          >
            <span>مشاهده و تست زنده پورتال راننده (دمو)</span>
            <ExternalLink className="w-4 h-4 text-blue-600" />
          </Link>

          <Link
            href="/reports"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold text-sm rounded-xl transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-zinc-600" />
            <span>گزارش‌های مالی و اکسل</span>
          </Link>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-right pt-8">
          <div className="p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm space-y-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileCheck className="w-4 h-4" />
            </div>
            <h2 className="font-bold text-sm text-zinc-900">امضای تعهد قبل از پرداخت</h2>
            <p className="text-xs text-zinc-500 leading-relaxed">
              راننده الزماً قبل از دسترسی به درگاه پرداخت یا ثبت فیش، متن رسمی تعهدنامه را مطالعه و با
              کد OTP امضا می‌کند.
            </p>
          </div>

          <div className="p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm space-y-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <h2 className="font-bold text-sm text-zinc-900">۶ درگاه بانکی شتابی</h2>
            <p className="text-xs text-zinc-500 leading-relaxed">
              پشتیبانی از سپ، ملت، پاسارگاد، سداد، زرین‌پال و زیبال با استعلام و تاییدیه سرور-به-سرور
              (مبالغ تماماً ریال).
            </p>
          </div>

          <div className="p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm space-y-2">
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <h2 className="font-bold text-sm text-zinc-900">۵ محور وضعیت مستقل</h2>
            <p className="text-xs text-zinc-500 leading-relaxed">
              تفکیک کامل وضعیت حمل، مدارک، پرداخت، تعهد و آزادسازی، و استخراج فازهای ۱۵ گانه به صورت
              مشتق‌شده و بدون تناقض.
            </p>
          </div>

          <div className="p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm space-y-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <h2 className="font-bold text-sm text-zinc-900">آزادسازی محافظت‌شده بارنامه</h2>
            <p className="text-xs text-zinc-500 leading-relaxed">
              فایل‌های PDF بارنامه در فضای اختصاصی نگهداری شده و فقط پس از احراز شرایط و صدور توکن امن
              قابل دانلود هستند.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-6xl mx-auto px-6 py-6 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>شرکت حمل و نقل سراسری خلیج فارس — سیستم فعال روی پورت ۳۰۰۰ لوکال‌هاست</span>
        </div>
        <div>barnameh-pay © ۱۴۰۳ — تمامی حقوق محفوظ است</div>
      </footer>
    </div>
  );
}
