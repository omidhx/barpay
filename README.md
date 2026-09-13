# barnameh-pay (بارنامه‌پی)

سامانه مدیریت بارنامه و پرداخت راننده — محصول فارسی، راست‌به‌چپ، برای شرکت‌های حمل‌ونقل ایران.

- **ظرفیت هدف:** ۲۰۰ بارنامه در روز، ~۵۰ راننده هم‌زمان
- **جریان پول:** فقط راننده ← شرکت
- **ورود راننده:** لینک کوتاه‌عمر + OTP پیامکی — بدون نصب، بدون ثبت‌نام
- **زنجیره اصلی:** اکسل ← رکورد بارنامه ← اتصال PDF ← لینک راننده ← OTP ← نمایش مبلغ ← **پذیرش و امضای تعهدنامه** ← پرداخت (درگاه آنلاین یا کارت‌به‌کارت) ← تأیید ← دانلود امن PDF

## پشته فناوری

Next.js 15 (App Router) + TypeScript · PostgreSQL 16 + Prisma 6 · Zod + React Hook Form ·
Tailwind + shadcn/ui (RTL) · Vitest + Playwright · graphile-worker (صف PostgreSQL) ·
Docker Compose · Node.js 22 LTS

## این ریپازیتوری چگونه کار می‌کند

این پوشه «اسکلت کامل پروژهٔ barnameh-pay» است (مستندات + ساختار کد) که برای کار با ابزارهای کدنویسی ایجنت‌محور
(به‌ویژه **Google Antigravity**) طراحی شده:

```text
barnameh-pay/                  ← ریشهٔ پروژه (همین پوشه را در Antigravity باز کنید)
├── AGENTS.md                  ← فایل اصلی ایجنت‌ها — هر جلسه خودکار خوانده می‌شود
├── GEMINI.md / CLAUDE.md      ← پوینترهای سازگاری (Gemini CLI / Claude Code)
├── README.md / TODO.md        ← معرفی پروژه / چک‌لیست فازهای ۰ تا ۷
├── .env.example / .gitignore
├── .agents/rules/             ← قواعد Workspace آنتی‌گراویتی (فعال‌سازی با Glob)
├── prompts/                   ← پرامپت شروع برای Agent Manager
├── docs/
│   ├── AGENTS.md              ← قواعد ویرایش مستندات (AGENTS تودرتو)
│   ├── master-spec/           ← سند جامع v2.5 (منبع سیاست و تصمیم — ۳۶۹۳ خط)
│   ├── product/               ← mvp-scope، business-rules، acceptance-criteria
│   ├── architecture/          ← overview، data-model، state-transitions، invariants، api-contracts
│   ├── integrations/          ← payment-gateways، sms-providers
│   ├── security/              ← threat-model
│   ├── frontend/              ← ui-ux-rtl-guidelines
│   ├── quality/               ← testing-strategy
│   └── runbooks/              ← deploy، backup-restore، rollback، onboard، incident
├── src/
│   ├── AGENTS.md              ← قواعد کدنویسی (AGENTS تودرتو)
│   ├── app/                   ← (auth) · (panel) · driver — Next.js App Router
│   ├── modules/               ← ۱۰ ماژول + payments/gateways/adapters (۶ درگاه)
│   ├── components/ · lib/
├── prisma/
│   ├── AGENTS.md              ← قواعد اسکیما/مهاجرت (AGENTS تودرتو)
│   └── migrations/
├── workers/AGENTS.md          ← قواعد صف و ورکر (AGENTS تودرتو)
├── tests/
│   ├── AGENTS.md              ← قواعد تست (AGENTS تودرتو)
│   └── unit/ integration/ e2e/ fixtures/
├── scripts/ · .github/workflows/
└── (Dockerfile · docker-compose.yml — در فاز ۲ ساخته می‌شوند)
```

### نقشهٔ لینک‌دار مستندات

- چهار فایل اجرایی (تنها ورودی پیاده‌سازی): [business-rules](docs/product/business-rules.md) ·
  [data-model](docs/architecture/data-model.md) · [state-transitions](docs/architecture/state-transitions.md) · [invariants](docs/architecture/invariants.md)
- مرجع: [overview](docs/architecture/overview.md) · [api-contracts](docs/architecture/api-contracts.md) ·
  [payment-gateways](docs/integrations/payment-gateways.md) · [sms-providers](docs/integrations/sms-providers.md) ·
  [threat-model](docs/security/threat-model.md) · [ui-ux-rtl-guidelines](docs/frontend/ui-ux-rtl-guidelines.md) · [testing-strategy](docs/quality/testing-strategy.md)
- [سند مادر v2.5](docs/master-spec/barnameh-pay-master-doc-2.5.md) · [راهنمای سند مادر](docs/master-spec/README.md) ·
  [چک‌لیست فازها (TODO)](TODO.md) · [پرامپت شروع Antigravity](prompts/00-kickoff-antigravity.md)
- فایل‌های AGENTS تودرتو: [src](src/AGENTS.md) · [prisma](prisma/AGENTS.md) · [tests](tests/AGENTS.md) ·
  [workers](workers/AGENTS.md) · [docs](docs/AGENTS.md)

## قاعده تقدم مستندات

طبق فصل ۱۳.۲ سند مادر، **چهار فایل اجرایی** تنها ورودی پیاده‌سازی‌اند:

1. [business-rules](docs/product/business-rules.md)
2. [data-model](docs/architecture/data-model.md)
3. [state-transitions](docs/architecture/state-transitions.md)
4. [invariants](docs/architecture/invariants.md)

سند مادر منبع «سیاست و تصمیم» است، نه ورودی روزانه کدنویسی. تعارض = چهار فایل مقدم؛
issue ثبت کنید و سند مادر اصلاح شود.

## شروع سریع با Google Antigravity

1. این پوشه را به‌عنوان پوشه پروژه در Antigravity باز کنید (یا فایل‌ها را داخل
   ریپوی `barnameh-pay` کپی کنید و با Antigravity بازش کنید).
2. از نمای **Manager** (مدیریت ایجنت)، متن [پرامپت شروع](prompts/00-kickoff-antigravity.md) را
   به‌عنوان اولین پیام بفرستید — ایجنت ابتدا مستندات را می‌خواند و طرح (Artifact)
   می‌سازد.
3. طرح را بازبینی/تأیید کنید؛ سپس کار را **فقط فاز به فاز** جلو ببرید (ترتیب فازها در
   [TODO.md](TODO.md) — از فاز ۰ تثبیت قواعد، نه از احراز هویت!).
4. برای هر قابلیت، «کارت اجرا» بسازید (الگوی فصل ۱۳.۶ سند مادر) و به ایجنت همان کارت را بدهید.
5. خروجی هر ایجنت را از طریق **Artifact Review** (شامل Walkthrough اجرای زنده) ببینید و تأیید/رد کنید.

## الزامات محیط

- Node.js 22 LTS و Docker
- PostgreSQL 16 (قیدهای فیزیکی فصل ۷.۴ **فقط** روی PostgreSQL معنا دارند — MySQL گزینه نیست)
- `cp .env.example .env` و مقداردهی متغیرها (هرگز `.env` واقعی کامیت نمی‌شود)

## نقش‌ها

OWNER / MANAGER / SUPERVISOR (سرپرست عملیات — مرجع تأیید و واگذاری مجوز) /
OPERATOR / TECH_ADMIN (دسترسی JIT محدود) / DRIVER (فقط لینک + OTP).
