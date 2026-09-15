"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FileText,
  ShieldCheck,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Hash,
  Eye,
  Check,
} from "lucide-react";

interface CommitmentVersionItem {
  id: string;
  title: string;
  templateKey: string;
  body: string;
  contentHash: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  isDefault: boolean;
  acceptancesCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function CommitmentsPage() {
  const [versions, setVersions] = useState<CommitmentVersionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeVersion, setActiveVersion] = useState<CommitmentVersionItem | null>(null);
  const [previewVersion, setPreviewVersion] = useState<CommitmentVersionItem | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [saving, setSaving] = useState(false);

  // Sample Preview Variables
  const [sampleDriver, setSampleDriver] = useState("علی محمدی");
  const [sampleWaybill, setSampleWaybill] = useState("۹۸۷۶۵۴");
  const [sampleAmount, setSampleAmount] = useState("۸۰٬۷۰۰٬۰۰۰");
  const [sampleOrigin, setSampleOrigin] = useState("بندرعباس");
  const [sampleDestination, setSampleDestination] = useState("تهران");

  const loadVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/panel/commitments");
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) {
          setVersions(json.data.versions);
          const active = json.data.versions.find((v: CommitmentVersionItem) => v.status === "ACTIVE") || json.data.versions[0];
          setActiveVersion(active || null);
          setPreviewVersion(active || null);
        }
      }
    } catch {
      setMessage({ type: "error", text: "خطا در بارگذاری نسخه‌های تعهدنامه." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const handleActivate = async (versionId: string) => {
    setMessage(null);
    try {
      const res = await fetch("/api/panel/commitments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage({ type: "success", text: "نسخه تعهدنامه با موفقیت فعال و به عنوان قالب پیش‌فرض تنظیم شد." });
        loadVersions();
      } else {
        setMessage({ type: "error", text: json.message || "خطا در فعال‌سازی نسخه." });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newBody) return;

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/panel/commitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          templateBody: newBody,
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage({ type: "success", text: "نسخه جدید تعهدنامه حقوقی با موفقیت ثبت شد." });
        setShowCreateModal(false);
        setNewTitle("");
        setNewBody("");
        loadVersions();
      } else {
        setMessage({ type: "error", text: json.message || "خطا در ایجاد تعهدنامه." });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    } finally {
      setSaving(false);
    }
  };

  const renderInterpolatedPreview = (bodyText: string) => {
    return bodyText
      .replace(/\{driver_name\}/g, sampleDriver)
      .replace(/\{waybill_number\}/g, sampleWaybill)
      .replace(/\{amount\}/g, sampleAmount)
      .replace(/\{origin\}/g, sampleOrigin)
      .replace(/\{destination\}/g, sampleDestination)
      .replace(/\{issue_date\}/g, new Date().toLocaleDateString("fa-IR"))
      .replace(/\{organization_name\}/g, "شرکت حمل و نقل سراسری خلیج فارس");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">مدیریت نسخه‌های تعهدنامه حقوقی</h1>
          <p className="text-xs text-zinc-500 mt-1">
            تنظیم و ویرایش قالب‌های حقوقی، اعتبارسنجی متغیرهای پویا و مدیریت اقرار الکترونیک رانندگان
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>ثبت نسخه جدید</span>
          </button>
          <button
            onClick={loadVersions}
            disabled={loading}
            className="p-2 border border-zinc-300 rounded-xl hover:bg-zinc-50 text-zinc-600 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
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

      {/* Active Version Overview Card */}
      {activeVersion && (
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-zinc-900">{activeVersion.title}</h2>
                  <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                    نسخه رسمی فعال
                  </span>
                </div>
                <span className="text-[11px] text-zinc-400 font-mono block mt-0.5">
                  شناسه قالب: {activeVersion.templateKey}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-600 flex items-center gap-1.5 font-mono">
                <Hash className="w-3.5 h-3.5 text-zinc-400" />
                هش: {activeVersion.contentHash.substring(0, 16)}...
              </span>
              <span className="px-3 py-1 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-medium">
                تعداد امضاهای ثبت‌شده: {activeVersion.acceptancesCount.toLocaleString("fa-IR")}
              </span>
            </div>
          </div>

          <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 text-xs text-zinc-700 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap font-sans">
            {activeVersion.body}
          </div>
        </div>
      )}

      {/* Live Variable Sandbox & Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Variable Inputs */}
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-zinc-900 border-b border-zinc-100 pb-3 flex items-center gap-2">
            <Eye className="w-4 h-4 text-blue-600" />
            <span>آزمایشگاه متغیرهای پویا</span>
          </h2>
          <p className="text-xs text-zinc-500 leading-relaxed">
            مقادیر زیر را تغییر دهید تا پیش‌نمایش نحوه رندر تعهدنامه برای راننده را مشاهده فرمایید:
          </p>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-zinc-600 block mb-1 font-medium">{`{driver_name}`} نام راننده:</label>
              <input
                type="text"
                value={sampleDriver}
                onChange={(e) => setSampleDriver(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-zinc-600 block mb-1 font-medium">{`{waybill_number}`} شماره بارنامه:</label>
              <input
                type="text"
                value={sampleWaybill}
                onChange={(e) => setSampleWaybill(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl font-mono focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-zinc-600 block mb-1 font-medium">{`{amount}`} کرایه ناخالص (ریال):</label>
              <input
                type="text"
                value={sampleAmount}
                onChange={(e) => setSampleAmount(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl font-mono focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-zinc-600 block mb-1 font-medium">مبدأ:</label>
                <input
                  type="text"
                  value={sampleOrigin}
                  onChange={(e) => setSampleOrigin(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="text-zinc-600 block mb-1 font-medium">مقصد:</label>
                <input
                  type="text"
                  value={sampleDestination}
                  onChange={(e) => setSampleDestination(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Live Rendered Output */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              <span>پیش‌نمایش زنده در نمای راننده</span>
            </h2>
            <span className="text-xs text-zinc-400">
              قالب انتخابی: {previewVersion ? previewVersion.title : "—"}
            </span>
          </div>

          <div className="p-5 bg-blue-50/40 border border-blue-100 rounded-2xl text-xs text-zinc-800 leading-relaxed min-h-[220px] whitespace-pre-wrap font-sans">
            {previewVersion ? renderInterpolatedPreview(previewVersion.body) : "متنی یافت نشد."}
          </div>

          <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center gap-2 text-xs text-zinc-600">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>
              متن بالا عینا در مرحله دوم پورتال راننده پس از ورود با کد تایید پیامکی نمایش داده خواهد شد.
            </span>
          </div>
        </div>
      </div>

      {/* Historical Versions Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-900">سوابق کلیه نسخه‌های تعهدنامه سازمان</h2>
          <span className="text-xs text-zinc-500">{versions.length.toLocaleString("fa-IR")} نسخه ثبت‌شده</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead className="bg-zinc-50 text-zinc-600 border-b border-zinc-200">
              <tr>
                <th className="p-3.5 font-semibold">عنوان نسخه</th>
                <th className="p-3.5 font-semibold">کلید قالب</th>
                <th className="p-3.5 font-semibold">هش SHA-256</th>
                <th className="p-3.5 font-semibold">وضعیت</th>
                <th className="p-3.5 font-semibold">امضاهای ثبت‌شده</th>
                <th className="p-3.5 font-semibold">تاریخ ایجاد</th>
                <th className="p-3.5 font-semibold text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {versions.map((ver) => (
                <tr key={ver.id} className="hover:bg-zinc-50/60">
                  <td className="p-3.5 font-bold text-zinc-900">{ver.title}</td>
                  <td className="p-3.5 font-mono text-zinc-600">{ver.templateKey}</td>
                  <td className="p-3.5 font-mono text-[11px] text-zinc-400">
                    {ver.contentHash.substring(0, 12)}...
                  </td>
                  <td className="p-3.5">
                    {ver.status === "ACTIVE" ? (
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px]">
                        فعال
                      </span>
                    ) : ver.status === "DRAFT" ? (
                      <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full font-bold text-[10px]">
                        پیش‌نویس
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-zinc-100 text-zinc-500 rounded-full text-[10px]">
                        آرشیو
                      </span>
                    )}
                  </td>
                  <td className="p-3.5 font-mono font-bold text-zinc-800">
                    {ver.acceptancesCount.toLocaleString("fa-IR")}
                  </td>
                  <td className="p-3.5 text-zinc-500">
                    {new Date(ver.createdAt).toLocaleDateString("fa-IR")}
                  </td>
                  <td className="p-3.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => setPreviewVersion(ver)}
                        className="px-2.5 py-1 border border-zinc-200 rounded-lg hover:bg-zinc-100 text-zinc-600 text-[11px]"
                      >
                        پیش‌نمایش
                      </button>
                      {ver.status !== "ACTIVE" && (
                        <button
                          onClick={() => handleActivate(ver.id)}
                          className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-[11px] font-semibold flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          <span>فعال‌سازی</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Version Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-xl border border-zinc-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-zinc-900">تعریف نسخه جدید تعهدنامه حقوقی</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-zinc-400 hover:text-zinc-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-700 font-semibold mb-1">
                  عنوان نسخه (مثال: تعهدنامه حمل و ترخیص بارنامه - نسخه ۲)
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  placeholder="عنوان رسمی نسخه را وارد نمایید..."
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-700 font-semibold mb-1">
                  متن حقوقی تعهدنامه (شامل متغیرهای پویا)
                </label>
                <p className="text-[11px] text-zinc-400 mb-2">
                  می‌توانید از متغیرهای {`{driver_name}`}، {`{waybill_number}`}، {`{amount}`}، {`{issue_date}`}، {`{origin}`} و {`{destination}`} استفاده فرمایید.
                </p>
                <textarea
                  rows={8}
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  required
                  placeholder="اینجانب {driver_name} راننده بارنامه شماره {waybill_number} متعهد می‌گردم..."
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:bg-zinc-300 shadow-sm"
                >
                  {saving ? "در حال ثبت..." : "ثبت نسخه تعهدنامه"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
