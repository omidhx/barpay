# معماری فنی — overview

> **منبع:** سند مادر v2.5 فصل ۹. تصمیم: **Modular Monolith** — میکروسرویس/Kubernetes/چند دیتابیس
> مستقل برای این مقیاس لازم نیست و فقط هزینهٔ نگهداری می‌سازد.

## توپولوژی

```text
Web App / Admin Panel / Driver Portal
                │
     API Layer (Next.js Route Handlers)
                │
 ┌──────────────────────────────────────────┐
 │ Auth │ Imports │ Waybills │ Documents     │
 │ Payments/Gateways │ Drivers │ Commitments │
 │ Delivery │ Reports │ Audit │ Notifications│
 └──────────────────────────────────────────┘
                │
   PostgreSQL + Private Object Storage (S3 سازگار / MinIO)
                │
   Background Jobs (graphile-worker — صف PostgreSQL)
```

- **web + worker:** یک Docker image واحد، دو سرویس Compose جدا (ری‌استارت وب، ارسال پیامک SLA-دار را قطع نمی‌کند).
- مرزهای `src/modules/` با قانون import (dependency-cruiser در CI) محافظت می‌شوند — ماژول از internals ماژول دیگر import نمی‌کند.

## پشته

| لایه | انتخاب |
|---|---|
| فرانت + بک | Next.js 15 (App Router) + TypeScript — SSR برای پورتال راننده |
| دیتابیس | PostgreSQL 16+ (قیدهای فیزیکی فقط در PG) |
| ORM | Prisma 6 — مهاجرت فقط از مسیر migration |
| اعتبارسنجی/فرم | Zod + React Hook Form (اسکیمای مشترک فرانت/بک) |
| UI | Tailwind + shadcn/ui با RTL |
| احراز هویت | Session cookies (DB-backed) + OTP abstraction |
| پیامک | فراز + ملی‌پیامک پشت آداپتر `SmsProvider` |
| درگاه | آداپتر واحد `PaymentProvider` (۶ ارائه‌دهنده) |
| ذخیرهٔ فایل | Object storage خصوصی — هرگز مسیر عمومی وب |
| صف | graphile-worker (`FOR UPDATE SKIP LOCKED` + LISTEN/NOTIFY) — Redis فقط با نیاز واقعی |
| تست | Vitest + Playwright (+ fast-check برای تست خاصیت‌محور) |
| استقرار | Docker Compose + Nginx روی VPS + GitHub Actions |

کف نسخه‌ها: Node 22 LTS · Next 15 · PG 16 · Prisma 6؛ lockfile قفل patch؛ ارتقای major فقط با بازبینی مهاجرت.

## صف — چه چیزی کجا اجرا می‌شود

**در خود درخواست (تراکنشی):** هر گذار وضعیت مالی — تأیید، اصلاح، بازگشت وجه، آزادسازی، وریفای callback درگاه.

**در صف (worker):** پیامک (SLA ۳۰ ثانیه، ۵ تلاش با backoff، سوئیچ فراز→ملی‌پیامک پس از ۲ خطا، مدارشکن) · استعلام UNKNOWN درگاه (هر ۱۰ دقیقه تا ۲۴ ساعت) و انقضای تلاش باز >۲۰ دقیقه · پردازش فایل و گزارش‌ها · پاک‌سازی (فایل‌های یتیم >۲۴ ساعت، رکوردهای کوتاه‌عمر، اجرای retention) · به‌روزرسانی وضعیت تحویل پیامک.

ورود Redis فقط وقتی: rate-limit توزیع‌شده، صف فایل فراتر از ظرفیت worker دیتابیسی، قفل توزیع‌شدهٔ چندنمونه‌ای، کش پرترافیک واقعی.

## استقرار و فروش

> کد مشترک، انتشار استاندارد، **استقرار + دیتابیس + دامنهٔ جدا برای هر شرکت** (پاسخ ۱۰).

- ایزوله‌سازی ساده، قابل‌اثبات و بازیابی مستقل هر مشتری؛ Docker Compose استقرار نمونهٔ جدید را ارزان می‌کند.
- `organization_id` در مدل باقی می‌ماند + فیلتر سازمان در کوئری‌ها — مسیر SaaS آینده باز، بدون پیچیدگی چندمستاجری فعلی.
- ابزار `tools/migrate-all.ts` + registry استقرارها؛ rollout ترتیبی با health-check؛ شکست → hold همان سازمان.
- هاست اشتراکی PHP پشتیبانی نمی‌شود — الزام: اجرای Node، PostgreSQL، worker، cron، ذخیرهٔ خصوصی.

## SLO / بکاپ / بازیابی

| شاخص | هدف |
|---|---|
| RPO | ≤۱۵ دقیقه (WAL archiving / streaming + PITR) |
| RTO (دیسک سالم) | ≤۱ ساعت |
| RTO (از دست رفتن کامل سایت) | ≤۴ ساعت (restore از آرشیو off-site) |
| بکاپ DB | روزانه + WAL پیوسته؛ ۳۰ روزانه + ۱۲ ماهانه، رمزنگاری‌شده، off-site |
| بکاپ فایل PDF | همگام‌سازی روزانه off-site |
| آزمون restore | ماهانه روی staging + چک‌لیست verify (شمار بارنامه‌ها، آخرین payment، دانلود PDF نمونه) + ثبت در audit |
| SLA پیامک | p95 ≤۳۰ ثانیه؛ تحویل <۹۰٪ در ۱ ساعت → هشدار |
| هشدارها | عمق صف >۵ دقیقه · 5xx >۱٪ در ۵ دقیقه · بکاپ معوق >۲۶ ساعت · شکست درگاه >۱۰٪ در ۱ ساعت |
| API حساس | p95 ≤۸۰۰ms |

## مهاجرت چند-استقرار

- expand-contract؛ `CREATE INDEX CONCURRENTLY`؛ CHECK با `NOT VALID → VALIDATE`؛ backfill chunked و idempotent.
- snapshot پیش از مهاجرت جداول مالی؛ تست هر migration روی restore بکاپ واقعی در CI؛ drift-check در هر PR.
- rollback کد = image قبلی Docker؛ rollback داده = فقط از مسیر restore runbook (هرگز `git revert` روی schema).

## نقشهٔ لایهٔ بک‌اند (مسیر یک درخواست)

```text
Route Handler → ۱) احراز هویت ۲) Zod ۳) مجوز + organization_id از نشست
→ Service Layer → ۴) قواعد کسب‌وکار ۵) تراکنش + گذار شرطی ۶) audit ۷) jobهای اطلاع‌رسانی در همان تراکنش
→ Prisma + Object Storage → Response (envelope استاندارد + correlationId)
```

- Route Handler هیچ منطق کسب‌وکاری ندارد؛ سرویس‌ها تنها نقطهٔ تغییر وضعیت (از ماشین وضعیت ماژول)؛
- تزریق اجباری سازمان با Prisma Client Extension؛ `canRelease` تنها مرجع تصمیم آزادسازی؛
- تراکنش‌های الزامی: ثبت پرداخت = payments + اعلان؛ تأیید = UPDATE شرطی + review + audit + job پیامک؛ اصلاح = رکورد جدید amount + غیرفعال‌سازی قبلی + audit؛ بازگشت وجه = refunds + اعلان سرپرست.


---

## مستندات مرتبط

- [مدل داده](data-model.md) و [قراردادهای API](api-contracts.md)
- [سند مادر v2.5](../master-spec/barnameh-pay-master-doc-2.5.md) — فصل ۹ (معماری فنی)
- [AGENTS.md ریشه](../../AGENTS.md) و [AGENTS.md کد](../../src/AGENTS.md)
- [ران‌بوک استقرار](../runbooks/deploy.md) — توپولوژی web/worker/db
