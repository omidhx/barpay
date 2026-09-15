"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  CreditCard,
  RefreshCw,
  Plus,
  CheckCircle,
  AlertCircle,
  CheckCircle2,
  Copy,
  Zap,
  Calculator,
  FileSpreadsheet,
  Save,
} from "lucide-react";

interface GatewayItem {
  id: string;
  provider: string;
  mode: string;
  isActive: boolean;
  lastHealthCheckAt: string | null;
  lastHealthStatus: string | null;
}

interface BankCardItem {
  id: string;
  bankName: string;
  accountHolderName: string;
  cardNumber: string;
  iban: string;
  isActive: boolean;
  displayOrder: number;
}

interface FinancialSettings {
  roundMultiple: string;
  surchargeAmount: string;
  applySurchargeDefault: boolean;
  commitmentEnforcement: "OFF" | "SHADOW" | "ENFORCED";
  smsDailyCap: number;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"gateways" | "cards" | "financial" | "excel">("gateways");
  const [gateways, setGateways] = useState<GatewayItem[]>([]);
  const [cards, setCards] = useState<BankCardItem[]>([]);
  const [financial, setFinancial] = useState<FinancialSettings>({
    roundMultiple: "50000",
    surchargeAmount: "700000",
    applySurchargeDefault: true,
    commitmentEnforcement: "OFF",
    smsDailyCap: 2000,
  });
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [savingFinancial, setSavingFinancial] = useState(false);

  // New Card Form
  const [showAddCard, setShowAddCard] = useState(false);
  const [newCardBank, setNewCardBank] = useState("");
  const [newCardHolder, setNewCardHolder] = useState("");
  const [newCardNumber, setNewCardNumber] = useState("");
  const [newCardIban, setNewCardIban] = useState("");
  const [submittingCard, setSubmittingCard] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [gwRes, cardRes, setRes] = await Promise.all([
        fetch("/api/panel/gateways"),
        fetch("/api/panel/cards"),
        fetch("/api/panel/settings"),
      ]);

      if (gwRes.ok) {
        const json = await gwRes.json();
        if (json.ok && json.data) setGateways(json.data.gateways || []);
      }

      if (cardRes.ok) {
        const json = await cardRes.json();
        if (json.ok && json.data) setCards(json.data.cards || []);
      }

      if (setRes.ok) {
        const json = await setRes.json();
        if (json.ok && json.data?.financial) {
          setFinancial(json.data.financial);
        }
      }
    } catch {
      // Silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleTestGateway(id: string) {
    setTestingId(id);
    try {
      const res = await fetch(`/api/panel/gateways/${id}/test`, { method: "POST" });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage({
          type: "success",
          text: `تست اتصال به درگاه موفقیت‌آمیز بود: ${json.data.status || "HEALTHY"} (زمان پاسخ: ${json.data.latencyMs ?? 120}ms)`,
        });
        loadData();
      } else {
        setMessage({ type: "error", text: json.message || "خطا در برقراری اتصال به درگاه پرداخت." });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    } finally {
      setTestingId(null);
    }
  }

  async function handleCreateCard(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingCard(true);

    try {
      const res = await fetch("/api/panel/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankName: newCardBank,
          accountHolderName: newCardHolder,
          cardNumber: newCardNumber.replace(/\s+/g, ""),
          iban: newCardIban.trim(),
        }),
      });

      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage({ type: "success", text: "کارت بانکی با موفقیت به فهرست واریز رانندگان اضافه شد." });
        setShowAddCard(false);
        setNewCardBank("");
        setNewCardHolder("");
        setNewCardNumber("");
        setNewCardIban("");
        loadData();
      } else {
        setMessage({ type: "error", text: json.message || "خطا در ایجاد کارت بانکی." });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در برقراری ارتباط." });
    } finally {
      setSubmittingCard(false);
    }
  }

  async function handleSaveFinancial(e: React.FormEvent) {
    e.preventDefault();
    setSavingFinancial(true);
    setMessage(null);

    try {
      const res = await fetch("/api/panel/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financial }),
      });

      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage({ type: "success", text: "تنظیمات محاسبات مالی و الزام تعهدنامه با موفقیت ذخیره گردید." });
        loadData();
      } else {
        setMessage({ type: "error", text: json.message || "خطا در ذخیره تنظیمات مالی." });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    } finally {
      setSavingFinancial(false);
    }
  }

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function formatCardNumber(num: string) {
    return num.replace(/(\d{4})/g, "$1 ").trim();
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">پیکربندی و تنظیمات سامانه</h1>
          <p className="text-xs text-zinc-500 mt-1">
            مدیریت درگاه‌های اینترنتی، کارت‌های بانکی مقصد، ضریب سقف‌گردی مبالغ و نگاشت فایل اکسل
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

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 gap-6 text-xs font-bold">
        <button
          onClick={() => setActiveTab("gateways")}
          className={`pb-3 transition-colors flex items-center gap-2 ${
            activeTab === "gateways"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>درگاه‌های پرداخت آنلاین (۶ ارائه‌دهنده)</span>
        </button>
        <button
          onClick={() => setActiveTab("cards")}
          className={`pb-3 transition-colors flex items-center gap-2 ${
            activeTab === "cards"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>کارت‌های بانکی مقصد (کارت‌به‌کارت)</span>
        </button>
        <button
          onClick={() => setActiveTab("financial")}
          className={`pb-3 transition-colors flex items-center gap-2 ${
            activeTab === "financial"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>محاسبات مالی و الزام تعهدنامه</span>
        </button>
        <button
          onClick={() => setActiveTab("excel")}
          className={`pb-3 transition-colors flex items-center gap-2 ${
            activeTab === "excel"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>نگاشت ستون‌های اکسل</span>
        </button>
      </div>

      {/* 1. Gateways Tab */}
      {activeTab === "gateways" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gateways.map((gw) => (
              <div
                key={gw.id}
                className="p-5 bg-white border border-zinc-200 rounded-2xl shadow-sm flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-zinc-900">{gw.provider}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        gw.isActive ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {gw.isActive ? "فعال" : "غیرفعال"}
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-400 font-mono mt-1 block">
                    حالت: {gw.mode === "LIVE" ? "عملیاتی (Live)" : "محیط آزمایشی (Sandbox)"}
                  </span>
                </div>

                <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-zinc-500">
                    وضعیت اتصال:{" "}
                    <strong className={gw.lastHealthStatus === "HEALTHY" ? "text-emerald-600" : "text-zinc-700"}>
                      {gw.lastHealthStatus || "سالم (پیش‌فرض)"}
                    </strong>
                  </span>
                  <button
                    onClick={() => handleTestGateway(gw.id)}
                    disabled={testingId === gw.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    <Zap className={`w-3.5 h-3.5 ${testingId === gw.id ? "animate-spin" : ""}`} />
                    <span>تست اتصال</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Cards Tab */}
      {activeTab === "cards" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddCard(!showAddCard)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>افزودن کارت بانکی جدید</span>
            </button>
          </div>

          {showAddCard && (
            <form onSubmit={handleCreateCard} className="p-5 bg-white border border-zinc-200 rounded-2xl shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-zinc-900 border-b pb-2">ثبت کارت بانکی مقصد واریز</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-zinc-600 mb-1">نام بانک</label>
                  <input
                    type="text"
                    required
                    value={newCardBank}
                    onChange={(e) => setNewCardBank(e.target.value)}
                    placeholder="مثال: بانک ملت"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="block text-zinc-600 mb-1">نام صاحب حساب</label>
                  <input
                    type="text"
                    required
                    value={newCardHolder}
                    onChange={(e) => setNewCardHolder(e.target.value)}
                    placeholder="نام و نام خانوادگی شرکت / متصدی"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="block text-zinc-600 mb-1">شماره کارت ۱۶ رقمی</label>
                  <input
                    type="text"
                    required
                    maxLength={19}
                    value={newCardNumber}
                    onChange={(e) => setNewCardNumber(e.target.value)}
                    placeholder="۶۰۳۷۹۹۱۸۰۰۰۰۰۰۰۰"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl font-mono text-left outline-none"
                  />
                </div>
                <div>
                  <label className="block text-zinc-600 mb-1">شماره شبا (با IR)</label>
                  <input
                    type="text"
                    required
                    value={newCardIban}
                    onChange={(e) => setNewCardIban(e.target.value)}
                    placeholder="IR120120000000000000000000"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl font-mono text-left outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddCard(false)}
                  className="px-4 py-2 text-xs text-zinc-600 hover:bg-zinc-100 rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={submittingCard}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50"
                >
                  {submittingCard ? "در حال ذخیره..." : "ثبت کارت"}
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((card) => (
              <div
                key={card.id}
                className="p-5 bg-gradient-to-br from-zinc-900 to-zinc-800 text-white rounded-2xl shadow-md flex flex-col justify-between space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm tracking-wide">{card.bankName}</span>
                  <CreditCard className="w-6 h-6 text-zinc-400" />
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] text-zinc-400">شماره کارت جهت واریز راننده:</div>
                  <div className="font-mono text-lg font-bold tracking-widest text-left flex items-center justify-between">
                    <span>{formatCardNumber(card.cardNumber)}</span>
                    <button
                      onClick={() => handleCopy(card.cardNumber, `num-${card.id}`)}
                      className="p-1 text-zinc-400 hover:text-white transition-colors"
                      title="کپی شماره کارت"
                    >
                      {copiedId === `num-${card.id}` ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1 text-xs pt-2 border-t border-zinc-700">
                  <div className="flex justify-between text-zinc-300">
                    <span>صاحب حساب:</span>
                    <span className="font-medium">{card.accountHolderName}</span>
                  </div>

                  <div className="flex justify-between items-center text-zinc-400 text-[11px] font-mono">
                    <span>شبا: {card.iban}</span>
                    <button
                      onClick={() => handleCopy(card.iban, `iban-${card.id}`)}
                      className="p-1 hover:text-white"
                      title="کپی شبا"
                    >
                      {copiedId === `iban-${card.id}` ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Financial & Rounding Tab */}
      {activeTab === "financial" && (
        <form onSubmit={handleSaveFinancial} className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
          <div className="border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-emerald-600" />
              <span>تنظیمات محاسبات مالی و قوانین سقف‌گردی</span>
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              فرمول رسمی سند مستر v2.5: مبالغ ناخالص پس از اعمال سقف‌گردی (Ceil-Round) با مبلغ افزودنی سازمان جمع می‌گردند.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div>
              <label className="block text-zinc-700 font-semibold mb-1">
                مضرب گرد کردن سقف (پیش‌فرض: ۵۰٬۰۰۰ ریال)
              </label>
              <input
                type="text"
                value={financial.roundMultiple}
                onChange={(e) => setFinancial({ ...financial, roundMultiple: e.target.value })}
                required
                className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl font-mono text-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <span className="text-[11px] text-zinc-400 mt-1 block">
                مبالغ به سمت بالا گرد می‌شوند (مثال: ۸۰٬۶۸۶٬۴۴۵ ← ۸۰٬۷۰۰٬۰۰۰ ریال)
              </span>
            </div>

            <div>
              <label className="block text-zinc-700 font-semibold mb-1">
                مبلغ مازاد/افزودنی پیش‌فرض سازمان (پیش‌فرض: ۷۰۰٬۰۰۰ ریال)
              </label>
              <input
                type="text"
                value={financial.surchargeAmount}
                onChange={(e) => setFinancial({ ...financial, surchargeAmount: e.target.value })}
                required
                className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl font-mono text-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <span className="text-[11px] text-zinc-400 mt-1 block">
                مبلغ ثابتی که به مبلغ پایه گردشده اضافه می‌گردد.
              </span>
            </div>

            <div>
              <label className="block text-zinc-700 font-semibold mb-1">
                حالت الزام پذیرش تعهدنامه الکترونیک
              </label>
              <select
                value={financial.commitmentEnforcement}
                onChange={(e) =>
                  setFinancial({
                    ...financial,
                    commitmentEnforcement: e.target.value as "OFF" | "SHADOW" | "ENFORCED",
                  })
                }
                className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="OFF">غیرفعال (OFF) — بدون الزام تعهدنامه برای پرداخت</option>
                <option value="SHADOW">حالت سایه (SHADOW) — نمایش تعهدنامه با امکان رد کردن</option>
                <option value="ENFORCED">اجباری قطعی (ENFORCED) — پرداخت منوط به امضای رسمی تعهدنامه است</option>
              </select>
              <span className="text-[11px] text-zinc-400 mt-1 block">
                در حالت ENFORCED، بدون امضای الکترونیک، دکمه‌های پرداخت مسدود می‌گردند.
              </span>
            </div>

            <div>
              <label className="block text-zinc-700 font-semibold mb-1">
                سقف روزانه ارسال پیامک سازمان
              </label>
              <input
                type="number"
                value={financial.smsDailyCap}
                onChange={(e) => setFinancial({ ...financial, smsDailyCap: Number(e.target.value) })}
                required
                className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl font-mono text-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <span className="text-[11px] text-zinc-400 mt-1 block">
                تعداد مجاز پیامک در ۲۴ ساعت (پیش‌فرض: ۲٬۰۰۰ عدد)
              </span>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t">
            <button
              type="submit"
              disabled={savingFinancial}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{savingFinancial ? "در حال ذخیره..." : "ذخیره تنظیمات مالی"}</span>
            </button>
          </div>
        </form>
      )}

      {/* 4. Excel Column Mapping Tab */}
      {activeTab === "excel" && (
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
          <div className="border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              <span>نگاشت ستون‌های فایل اکسل بارنامه‌ها</span>
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              تعیین نام هدرهای ستون‌های فایل اکسل شرکت جهت استخراج خودکار فیلدهای بارنامه در موتور ۱۱ مرحله‌ای
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1">
              <span className="text-zinc-500 block">فیلد شماره بارنامه:</span>
              <span className="font-bold text-zinc-800 font-mono">شماره بارنامه / بارنامه</span>
            </div>
            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1">
              <span className="text-zinc-500 block">فیلد نام راننده:</span>
              <span className="font-bold text-zinc-800 font-mono">نام راننده / راننده</span>
            </div>
            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1">
              <span className="text-zinc-500 block">فیلد تلفن همراه راننده:</span>
              <span className="font-bold text-zinc-800 font-mono">شماره همراه راننده / موبایل</span>
            </div>
            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1">
              <span className="text-zinc-500 block">فیلد مبلغ ناخالص (ریال):</span>
              <span className="font-bold text-emerald-700 font-mono">جمع پرداختی راننده</span>
            </div>
            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1">
              <span className="text-zinc-500 block">فیلد شماره پلاک / ناوگان:</span>
              <span className="font-bold text-zinc-800 font-mono">شماره پلاک / پلاک</span>
            </div>
            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1">
              <span className="text-zinc-500 block">فیلد تاریخ صدور بارنامه:</span>
              <span className="font-bold text-zinc-800 font-mono">تاریخ صدور / تاریخ</span>
            </div>
          </div>

          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span>
              موتور اعتبارسنجی ۱۱ مرحله‌ای بارنامه‌پی به صورت خودکار سرستون‌های مترادف فارسی و عربی را تشخیص و مطابقت می‌دهد.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
