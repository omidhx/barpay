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

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"gateways" | "cards">("gateways");
  const [gateways, setGateways] = useState<GatewayItem[]>([]);
  const [cards, setCards] = useState<BankCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
      const [gwRes, cardRes] = await Promise.all([
        fetch("/api/panel/gateways"),
        fetch("/api/panel/cards"),
      ]);

      if (gwRes.ok) {
        const json = await gwRes.json();
        if (json.ok && json.data) setGateways(json.data.gateways || []);
      }

      if (cardRes.ok) {
        const json = await cardRes.json();
        if (json.ok && json.data) setCards(json.data.cards || []);
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
        setMessage({ type: "error", text: json.message || "خطا در ثبت کارت بانکی (فرمت شماره کارت یا شبا نامعتبر است)." });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    } finally {
      setSubmittingCard(false);
    }
  }

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function formatCardNumber(num: string): string {
    return num.replace(/(\d{4})(?=\d)/g, "$1-");
  }

  const gatewayProvidersName: Record<string, string> = {
    SEP: "سامان‌کیش (SEP)",
    BPM: "به‌پرداخت ملت (BPM)",
    PASARGAD: "پرداخت الکترونیک پاسارگاد",
    SADAD: "پرداخت الکترونیک سداد (ملی)",
    ZARINPAL: "زرین‌پال (پرداختیار)",
    ZIBAL: "زیبال (پرداختیار)",
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">تنظیمات درگاه‌های پرداخت و حساب‌های بانکی</h1>
          <p className="text-xs text-zinc-500 mt-1">
            پیکربندی ۶ درگاه پرداخت شتابی، حساب‌ها و کارت‌های مجاز جهت واریز وجه توسط راننده
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

      {/* Tab Selector */}
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-2">
        <button
          onClick={() => setActiveTab("gateways")}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === "gateways"
              ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
              : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          درگاه‌های پرداخت اینترنتی (IPG)
        </button>
        <button
          onClick={() => setActiveTab("cards")}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === "cards"
              ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
              : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          کارت‌های بانکی شرکت (کارت به کارت)
        </button>
      </div>

      {/* Tab 1: Gateways */}
      {activeTab === "gateways" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {["SEP", "BPM", "PASARGAD", "SADAD", "ZARINPAL", "ZIBAL"].map((provKey) => {
              const gw = gateways.find((g) => g.provider === provKey);
              const isConfigured = Boolean(gw);
              const isActive = gw?.isActive ?? false;

              return (
                <div
                  key={provKey}
                  className={`p-5 rounded-2xl border transition-all shadow-sm flex flex-col justify-between ${
                    isActive ? "bg-white border-blue-200" : "bg-zinc-50/60 border-zinc-200"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-zinc-900">
                        {gatewayProvidersName[provKey] || provKey}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isActive
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-zinc-200 text-zinc-600"
                        }`}
                      >
                        {isActive ? "فعال در پورتال" : "غیرفعال"}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-500 leading-relaxed">
                      اتصال سرور-به-سرور شتابی، تأیید خودکار و استعلام دوره‌ای مبالغ نامشخص (UNKNOWN).
                    </p>

                    {gw?.lastHealthCheckAt && (
                      <div className="text-[10px] text-zinc-400">
                        آخرین پایش سلامت: {new Date(gw.lastHealthCheckAt).toLocaleTimeString("fa-IR")}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 mt-2 border-t border-zinc-100 flex items-center justify-between">
                    <span className="text-[11px] font-mono text-zinc-400">
                      {isConfigured ? "پیکربندی شده" : "عدم پیکربندی"}
                    </span>

                    {isConfigured && gw && (
                      <button
                        onClick={() => handleTestGateway(gw.id)}
                        disabled={testingId === gw.id}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>{testingId === gw.id ? "در حال تست..." : "تست آنلاین اتصال"}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Bank Cards */}
      {activeTab === "cards" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-zinc-900">کارت‌های واریز نمایش‌داده‌شده به رانندگان</h2>
            <button
              onClick={() => setShowAddCard(!showAddCard)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>افزودن کارت بانکی جدید</span>
            </button>
          </div>

          {/* Add Card Form */}
          {showAddCard && (
            <form onSubmit={handleCreateCard} className="p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-zinc-900">مشخصات کارت بانکی جدید</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-zinc-600 mb-1">نام بانک:</label>
                  <input
                    type="text"
                    required
                    value={newCardBank}
                    onChange={(e) => setNewCardBank(e.target.value)}
                    placeholder="مثلاً: بانک ملت یا بانک ملی"
                    className="w-full p-2 bg-zinc-50 border border-zinc-300 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-zinc-600 mb-1">نام صاحب حساب:</label>
                  <input
                    type="text"
                    required
                    value={newCardHolder}
                    onChange={(e) => setNewCardHolder(e.target.value)}
                    placeholder="مثلاً: شرکت حمل و نقل سراسری خلیج فارس"
                    className="w-full p-2 bg-zinc-50 border border-zinc-300 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-zinc-600 mb-1">شماره ۱۶ رقمی کارت:</label>
                  <input
                    type="text"
                    required
                    maxLength={16}
                    value={newCardNumber}
                    onChange={(e) => setNewCardNumber(e.target.value)}
                    placeholder="6037991122334455"
                    className="w-full p-2 font-mono bg-zinc-50 border border-zinc-300 rounded-xl focus:outline-none focus:border-blue-500 text-left"
                  />
                </div>
                <div>
                  <label className="block text-zinc-600 mb-1">شماره شبا (با IR):</label>
                  <input
                    type="text"
                    required
                    maxLength={26}
                    value={newCardIban}
                    onChange={(e) => setNewCardIban(e.target.value)}
                    placeholder="IR270170000000100324200001"
                    className="w-full p-2 font-mono bg-zinc-50 border border-zinc-300 rounded-xl focus:outline-none focus:border-blue-500 text-left"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
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

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.length > 0 ? (
              cards.map((card) => (
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
              ))
            ) : (
              <div className="col-span-full p-8 bg-white rounded-2xl border border-zinc-200 text-center text-xs text-zinc-400">
                هیچ کارت بانکی فعالی در سامانه ثبت نشده است.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
