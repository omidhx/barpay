"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Truck, Shield, Lock, Phone, ArrowLeft, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e?: React.FormEvent, customMobile?: string) => {
    if (e) e.preventDefault();
    const targetMobile = customMobile || mobile;

    if (!targetMobile) {
      setError("لطفاً شماره موبایل را وارد فرمایید.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: targetMobile,
          password: password || "demo1234",
        }),
      });

      const json = await res.json();
      if (res.ok && json.ok) {
        router.push("/dashboard");
      } else {
        setError(json.message || "خطا در احراز هویت. اطلاعات ورود معتبر نیست.");
      }
    } catch {
      setError("خطا در برقراری ارتباط با سرور.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center items-center p-4 sm:p-6" dir="rtl">
      <div className="max-w-md w-full space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md">
            <Truck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-zinc-900 tracking-tight">بارنامه‌پی</h1>
          <p className="text-xs text-zinc-500">سامانه متمرکز مدیریت بارنامه و تسویه رانندگان</p>
        </div>

        {/* Login Box */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-zinc-200 shadow-sm space-y-5">
          <div className="border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-600" />
              <span>ورود متصدیان و پرسنل سازمان</span>
            </h2>
          </div>

          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={(e) => handleLogin(e)} className="space-y-4 text-xs">
            <div>
              <label className="block text-zinc-700 font-semibold mb-1.5">شماره تلفن همراه</label>
              <div className="relative">
                <input
                  type="tel"
                  required
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="09121112233"
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl font-mono text-left focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <Phone className="w-4 h-4 text-zinc-400 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-zinc-700 font-semibold mb-1.5">کلمه عبور</label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl font-mono text-left focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <Lock className="w-4 h-4 text-zinc-400 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 text-white font-bold rounded-xl text-xs shadow-sm transition-all flex items-center justify-center gap-2"
            >
              <span>{loading ? "در حال ورود..." : "ورود به سامانه"}</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Demo Access */}
          <div className="pt-4 border-t border-zinc-100 space-y-2">
            <span className="text-[11px] text-zinc-400 font-medium block text-center">
              دسترسی سریع آزمایشی (بدون نیاز به ثبت رمز):
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleLogin(undefined, "09121112233")}
                disabled={loading}
                className="p-2.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-800 rounded-xl text-[11px] font-bold transition-colors text-center"
              >
                ورود مدیر ارشد (رضا کریمی)
              </button>
              <button
                type="button"
                onClick={() => handleLogin(undefined, "09123334455")}
                disabled={loading}
                className="p-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-[11px] font-bold transition-colors text-center"
              >
                ورود متصدی ترابری (سارا امینی)
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] text-zinc-400">
          سامانه بارنامه‌پی — شرکت حمل و نقل سراسری خلیج فارس
        </div>
      </div>
    </div>
  );
}
