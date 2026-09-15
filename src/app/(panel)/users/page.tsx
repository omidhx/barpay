"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Edit2,
  Power,
} from "lucide-react";

interface UserItem {
  id: string;
  fullName: string;
  mobile: string;
  role: "ADMIN" | "OPERATOR" | "FINANCIAL" | "AUDITOR";
  status: "ACTIVE" | "INACTIVE";
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLE_DETAILS = {
  ADMIN: {
    title: "مدیر ارشد سیستم",
    color: "bg-purple-100 text-purple-800 border-purple-200",
    desc: "دسترسی کامل به کلیه تنظیمات، مبالغ، درگاه‌ها و اختیارات ترخیص",
  },
  FINANCIAL: {
    title: "متصدی مالی و اسناد",
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    desc: "بررسی فیش‌های واریزی، تایید پرداخت‌ها و اصلاح رسمی مبالغ",
  },
  OPERATOR: {
    title: "متصدی ترابری و لجستیک",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    desc: "ورود فایل‌های اکسل، تطبیق مدارک PDF و پیگیری تلفنی رانندگان",
  },
  AUDITOR: {
    title: "حسابرس و ناظر",
    color: "bg-zinc-100 text-zinc-700 border-zinc-200",
    desc: "دسترسی فقط‌خواندنی به لاگ‌های حسابرسی و گزارش‌های مالی",
  },
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Add User Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [newRole, setNewRole] = useState<"ADMIN" | "OPERATOR" | "FINANCIAL" | "AUDITOR">("OPERATOR");
  const [saving, setSaving] = useState(false);

  // Edit Role Modal State
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [selectedRole, setSelectedRole] = useState<"ADMIN" | "OPERATOR" | "FINANCIAL" | "AUDITOR">("OPERATOR");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/panel/users");
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) {
          setUsers(json.data.users);
        }
      }
    } catch {
      setMessage({ type: "error", text: "خطا در بارگذاری فهرست کاربران." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleToggleStatus = async (user: UserItem) => {
    const nextStatus = user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setMessage(null);
    try {
      const res = await fetch("/api/panel/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, status: nextStatus }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage({
          type: "success",
          text: `وضعیت کاربر ${user.fullName} به ${nextStatus === "ACTIVE" ? "فعال" : "غیرفعال"} تغییر یافت.`,
        });
        loadUsers();
      } else {
        setMessage({ type: "error", text: json.message || "خطا در تغییر وضعیت کاربر." });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setMessage(null);
    try {
      const res = await fetch("/api/panel/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: editingUser.id, role: selectedRole }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage({ type: "success", text: `نقش سازمانی ${editingUser.fullName} با موفقیت به‌روزرسانی شد.` });
        setEditingUser(null);
        loadUsers();
      } else {
        setMessage({ type: "error", text: json.message || "خطا در ویرایش نقش." });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName || !newMobile) return;

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/panel/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: newFullName,
          mobile: newMobile,
          role: newRole,
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage({ type: "success", text: `کاربر جدید (${newFullName}) با موفقیت به سازمان اضافه شد.` });
        setShowAddModal(false);
        setNewFullName("");
        setNewMobile("");
        setNewRole("OPERATOR");
        loadUsers();
      } else {
        setMessage({ type: "error", text: json.message || "خطا در ثبت کاربر جدید." });
      }
    } catch {
      setMessage({ type: "error", text: "خطا در ارتباط با سرور." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">مدیریت کاربران و دسترسی‌های سازمانی</h1>
          <p className="text-xs text-zinc-500 mt-1">
            تعریف پرسنل، تخصیص نقش‌های ۴ گانه (مدیر، ترابری، مالی، حسابرس) و پایش نشست‌های فعال
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-sm transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>افزودن کاربر جدید</span>
          </button>
          <button
            onClick={loadUsers}
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

      {/* Role Definitions Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(ROLE_DETAILS).map(([key, role]) => (
          <div key={key} className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-800">{role.title}</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${role.color}`}>
                {key}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">{role.desc}</p>
          </div>
        ))}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-zinc-900">پرسنل فعال و دارای دسترسی به سامانه</h2>
          </div>
          <span className="text-xs text-zinc-500">{users.length.toLocaleString("fa-IR")} کاربر</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead className="bg-zinc-50 text-zinc-600 border-b border-zinc-200">
              <tr>
                <th className="p-3.5 font-semibold">نام و نام خانوادگی</th>
                <th className="p-3.5 font-semibold">شماره موبایل</th>
                <th className="p-3.5 font-semibold">نقش سازمانی</th>
                <th className="p-3.5 font-semibold">وضعیت حساب</th>
                <th className="p-3.5 font-semibold">آخرین ورود</th>
                <th className="p-3.5 font-semibold text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {users.map((u) => {
                const r = ROLE_DETAILS[u.role] || ROLE_DETAILS.OPERATOR;
                return (
                  <tr key={u.id} className="hover:bg-zinc-50/60">
                    <td className="p-3.5 font-bold text-zinc-900 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[11px]">
                        {u.fullName.charAt(0)}
                      </div>
                      <span>{u.fullName}</span>
                    </td>
                    <td className="p-3.5 font-mono text-zinc-700">{u.mobile}</td>
                    <td className="p-3.5">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${r.color}`}>
                        {r.title}
                      </span>
                    </td>
                    <td className="p-3.5">
                      {u.status === "ACTIVE" ? (
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px]">
                          فعال
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-full font-bold text-[10px]">
                          غیرفعال
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-zinc-500 font-mono text-[11px]">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("fa-IR") : "وارد نشده"}
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            setEditingUser(u);
                            setSelectedRole(u.role);
                          }}
                          className="p-1.5 hover:bg-zinc-100 text-zinc-600 rounded-lg transition-colors"
                          title="تغییر نقش سازمانی"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(u)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            u.status === "ACTIVE"
                              ? "hover:bg-rose-50 text-rose-600"
                              : "hover:bg-emerald-50 text-emerald-600"
                          }`}
                          title={u.status === "ACTIVE" ? "غیرفعال‌سازی کاربر" : "فعال‌سازی مجدد کاربر"}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-zinc-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-zinc-900">ثبت پرسنل جدید در سازمان</h3>
              <button onClick={() => setShowAddModal(false)} className="text-zinc-400 hover:text-zinc-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-700 font-semibold mb-1">نام و نام خانوادگی</label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  required
                  placeholder="مثال: رضا کریمی"
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-700 font-semibold mb-1">شماره تلفن همراه</label>
                <input
                  type="tel"
                  value={newMobile}
                  onChange={(e) => setNewMobile(e.target.value)}
                  required
                  placeholder="09121234567"
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl font-mono text-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-700 font-semibold mb-1">نقش و سطح دسترسی</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserItem["role"])}
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="OPERATOR">متصدی ترابری (ورود اکسل، تطبیق PDF)</option>
                  <option value="FINANCIAL">متصدی مالی (بررسی فیش، تایید پرداخت)</option>
                  <option value="ADMIN">مدیر ارشد (تنظیمات، مبالغ و ترخیص)</option>
                  <option value="AUDITOR">حسابرس (فقط گزارش و لاگ حسابرسی)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:bg-zinc-300 shadow-sm"
                >
                  {saving ? "در حال ثبت..." : "افزودن کاربر"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl border border-zinc-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-zinc-900">تغییر نقش {editingUser.fullName}</h3>
              <button onClick={() => setEditingUser(null)} className="text-zinc-400 hover:text-zinc-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateRole} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-700 font-semibold mb-1">نقش جدید سازمانی</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as UserItem["role"])}
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="OPERATOR">متصدی ترابری (OPERATOR)</option>
                  <option value="FINANCIAL">متصدی مالی (FINANCIAL)</option>
                  <option value="ADMIN">مدیر ارشد (ADMIN)</option>
                  <option value="AUDITOR">حسابرس (AUDITOR)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 shadow-sm"
                >
                  ذخیره تغییرات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
