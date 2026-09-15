"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileSpreadsheet,
  FileText,
  Truck,
  CheckSquare,
  Settings,
  ExternalLink,
  Bell,
  ShieldCheck,
  Building2,
  Menu,
  X,
  Users,
  MessageSquare,
} from "lucide-react";

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    async function fetchNotifications() {
      try {
        const res = await fetch("/api/panel/notifications?unreadOnly=true");
        if (res.ok) {
          const json = await res.json();
          if (json.ok && json.data) {
            setUnreadCount(json.data.unreadCount || 0);
          }
        }
      } catch {
        // Silently handle if offline or during build
      }
    }
    fetchNotifications();
  }, []);

  const navItems = [
    {
      label: "داشبورد عملیاتی",
      href: "/dashboard",
      icon: LayoutDashboard,
      badge: null,
    },
    {
      label: "مدیریت بارنامه‌ها",
      href: "/waybills",
      icon: Truck,
      badge: null,
    },
    {
      label: "ورود فایل اکسل",
      href: "/imports",
      icon: FileSpreadsheet,
      badge: "گروهی",
    },
    {
      label: "اسناد و تطبیق PDF",
      href: "/documents",
      icon: FileText,
      badge: "۱:۱",
    },
    {
      label: "صف بررسی پرداخت‌ها",
      href: "/payments",
      icon: CheckSquare,
      badge: "کارتابل",
    },
    {
      label: "مانیتورینگ خطوط پیامک",
      href: "/monitoring",
      icon: MessageSquare,
      badge: "SLA",
    },
    {
      label: "قالب‌های تعهدنامه",
      href: "/commitments",
      icon: ShieldCheck,
      badge: "حقوقی",
    },
    {
      label: "مدیریت کاربران و نقش‌ها",
      href: "/users",
      icon: Users,
      badge: null,
    },
    {
      label: "گزارش‌های مالی و تسویه",
      href: "/reports",
      icon: FileSpreadsheet,
      badge: null,
    },
    {
      label: "تنظیمات سیستم و درگاه‌ها",
      href: "/settings",
      icon: Settings,
      badge: null,
    },
    {
      label: "پورتال راننده (دمو)",
      href: "/driver/demo-driver-token",
      icon: ExternalLink,
      badge: "تست زنده",
      external: true,
    },
  ];

  const pageTitleMap: Record<string, string> = {
    "/dashboard": "داشبورد عملیاتی",
    "/waybills": "مدیریت بارنامه‌ها",
    "/imports": "ورود فایل اکسل",
    "/documents": "اسناد و تطبیق PDF",
    "/payments": "صف بررسی پرداخت‌ها",
    "/monitoring": "مانیتورینگ خطوط و پیامک‌ها",
    "/commitments": "مدیریت نسخه‌های تعهدنامه",
    "/users": "مدیریت کاربران و دسترسی‌ها",
    "/reports": "گزارش‌های مالی و تسویه",
    "/settings": "تنظیمات سیستم و درگاه‌ها",
  };

  const currentPageTitle = pageTitleMap[pathname] || (pathname.startsWith("/waybills/") ? "جزئیات بارنامه" : "داشبورد عملیاتی");

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-zinc-200">
        <div className="flex items-center gap-2">
          <Truck className="w-6 h-6 text-blue-600" />
          <span className="font-bold text-base text-zinc-900">بارنامه‌پی</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg text-zinc-600 hover:bg-zinc-100"
          aria-label="منو"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`${
          mobileMenuOpen ? "block" : "hidden"
        } md:block w-full md:w-64 bg-white border-l border-zinc-200 flex-shrink-0 z-30 md:min-h-screen flex flex-col justify-between`}
      >
        <div>
          {/* Brand Logo */}
          <div className="hidden md:flex items-center gap-3 px-6 py-5 border-b border-zinc-100">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-lg text-zinc-900 leading-tight">بارنامه‌پی</div>
              <div className="text-xs text-zinc-500">سامانه مدیریت بارنامه و راننده</div>
            </div>
          </div>

          {/* Org Info Banner */}
          <div className="mx-4 my-3 p-3 bg-blue-50/70 border border-blue-100 rounded-xl flex items-center gap-3">
            <Building2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div className="overflow-hidden">
              <div className="text-xs text-zinc-500">سازمان فعال</div>
              <div className="text-xs font-semibold text-zinc-800 truncate">
                شرکت حمل و نقل سراسری خلیج فارس
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="px-3 py-2 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                      : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-zinc-500"}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-normal ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-zinc-100 space-y-3">
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>پایگاه داده و درگاه‌ها فعال</span>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center font-bold text-xs text-zinc-700">
              ع‌م
            </div>
            <div className="text-xs overflow-hidden">
              <div className="font-medium text-zinc-800">علی محمدی</div>
              <div className="text-zinc-500 truncate">مدیر سیستم</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="bg-white border-b border-zinc-200 px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <span className="font-semibold text-zinc-900">پنل مدیریت</span>
            <span>/</span>
            <span>{currentPageTitle}</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Notification Bell */}
            <div className="relative">
              <Link
                href="/dashboard#notifications"
                className="p-2 rounded-xl text-zinc-600 hover:bg-zinc-100 relative block"
                title="اعلانات سیستم"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </Link>
            </div>

            {/* Quick Demo Portal Button */}
            <Link
              href="/driver/demo-driver-token"
              target="_blank"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold rounded-lg border border-blue-200 transition-colors"
            >
              <span>مشاهده پورتال راننده</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
