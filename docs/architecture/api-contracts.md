# قراردادهای API — api-contracts

> **منبع:** سند مادر v2.5 فصل ۱۶.۳ و ۱۶.۷. همهٔ مسیرها با پیشوند `/api`.
> احراز پنل: session cookie · پورتال راننده: `driver_session` · callback درگاه: عمومی با state.

## قرارداد عمومی

- **Idempotency-Key:** همهٔ POSTهای جهش‌دهنده هدر `Idempotency-Key` (UUID ساختهٔ فرانت برای هر اقدام) می‌پذیرند؛ سرور پاسخ را ۲۴ ساعت به کلید گره می‌زند (جدول `idempotency_records`)؛ همان کلید + همان بدنه = بازپخش پاسخ؛ کلید + بدنهٔ متفاوت = `409 IDEMPOTENCY_KEY_REUSED`؛ مسابقهٔ هم‌زمان = انتظار ≤۵ ثانیه سپس `409 retryable`.
- **correlationId:** ساختهٔ سرور در هر پاسخ خطا و هر رکورد لاگ (ارزش ارسالی کلاینت فقط پیشنهاد).
- **تک‌سطح جهش مالی:** عملیات مالی حساس فقط از Route Handler؛ Server Action فقط فرم‌های غیرمالی.
- **صفحه‌بندی:** `page` + `pageSize` (حداکثر ۱۰۰) + `sort` در همهٔ فهرست‌ها.
- **پاسخ استاندارد:**

```json
{ "ok": true,  "data": { }, "error": null }
{ "ok": false, "data": null, "error": { "code": "PAYMENT_ALREADY_REVIEWED",
  "humanMessage": "این پرداخت قبلاً بررسی شده است.", "retryable": false, "correlationId": "c3d9f2a1" } }
```

- کد خطا پایدار از کاتالوگ `src/lib/errors/catalog.ts` (کد + پیام فارسی + اقدام پیشنهادی) — پیام ساده هرگز در کد پراکنده نوشته نمی‌شود.
- تاریخ: UTC ذخیره، شمسی نمایش؛ مبالغ: جداکنندهٔ هزارگان فارسی؛ RTL کامل.

## احراز هویت پنل

| متد | مسیر | شرح | مجوز |
|---|---|---|---|
| POST | `/api/auth/login` | ورود موبایل/رمز | — |
| POST | `/api/auth/logout` | خروج و ابطال نشست | session |
| GET | `/api/auth/me` | اطلاعات و مجوزهای کاربر جاری | session |

## سازمان و تنظیمات

| متد | مسیر | شرح | مجوز |
|---|---|---|---|
| GET/PUT | `/api/settings` | گرد شدن، افزودنی، نگهداری، پیامک | MANAGER |
| GET/POST/PUT/DELETE | `/api/payment-gateways[/:id]` | پیکربندی درگاه + تست اتصال (۲.۵) | MANAGE_PAYMENT_GATEWAYS |
| GET/POST/PUT/DELETE | `/api/bank-cards[/:id]` | کارت‌های واریز (۲.۵) | MANAGE_BANK_CARDS |
| GET/PUT | `/api/excel-mappings` | نگاشت ستون‌های اکسل | MANAGER |
| GET/POST | `/api/commitment-versions` | قالب‌های تعهدنامه | MANAGER |

> اعتبارنامهٔ درگاه پس از ذخیره هرگز در پاسخ API برنمی‌گردد (فقط provider/mode/is_active/آخرین تست).

## ورود اکسل

| متد | مسیر | شرح | مجوز |
|---|---|---|---|
| POST | `/api/imports` | آپلود + batch + پیش‌نمایش | OPERATOR |
| GET | `/api/imports` · `/api/imports/:id` | فهرست/جزئیات batch | OPERATOR |
| POST | `/api/imports/:id/commit` | ثبت نهایی (idempotent؛ >۵۰۰ ردیف: COMMITTING + poll) | OPERATOR |
| POST | `/api/imports/:id/cancel` | لغو batch | OPERATOR |

## اسناد PDF

| متد | مسیر | شرح | مجوز |
|---|---|---|---|
| POST | `/api/documents/bulk-upload` | آپلود گروهی + تطبیق | OPERATOR |
| GET | `/api/documents/match-results` | نتیجهٔ تطبیق batch | OPERATOR |
| POST | `/api/documents/:id/attach` | اتصال دستی | OPERATOR |
| POST | `/api/documents/:id/replace` | جایگزینی کنترل‌شده | REPLACE_PDF |

## بارنامه‌ها و لینک راننده

| متد | مسیر | شرح | مجوز |
|---|---|---|---|
| GET | `/api/waybills[/:id]` | فهرست فیلتردار / جزئیات کامل | OPERATOR |
| PATCH | `/api/waybills/:id` | اصلاح فیلدهای مجاز | OPERATOR |
| POST | `/api/waybills/:id/driver-link` | ساخت/تمدید لینک + تنظیم افزودنی | OPERATOR |
| POST | `/api/waybills/:id/send-link` | ارسال پیامک لینک | OPERATOR |
| POST | `/api/waybills/:id/cancel` | ابطال (دلیل الزامی) | CANCEL_WAYBILL |

## پرداخت، اصلاح، بازگشت وجه

| متد | مسیر | شرح | مجوز |
|---|---|---|---|
| GET | `/api/payments/review-queue` | صف بررسی + زمان انتظار | VERIFY_PAYMENT |
| POST | `/api/payments/:id/review` | تأیید/رد/مغایرت (idempotent) | VERIFY_PAYMENT |
| POST | `/api/waybills/:id/amount-correction` | اصلاح مبلغ پس از پرداخت | CORRECT_AMOUNT_AFTER_PAYMENT |
| POST | `/api/waybills/:id/residual-link` | ارسال لینک مابقی | CORRECT_AMOUNT_AFTER_PAYMENT |
| POST | `/api/payments/:id/refunds` | ثبت بازگشت وجه | RECORD_REFUND |
| POST | `/api/refunds/:id/approve` | تأیید سرپرست | APPROVE_REFUND |

## تحویل

| متد | مسیر | شرح | مجوز |
|---|---|---|---|
| POST | `/api/waybills/:id/authorize-release` | صدور مجوز | ISSUE_RELEASE |
| POST | `/api/waybills/:id/revoke-release` | لغو مجوز | ISSUE_RELEASE |
| GET | `/api/waybills/:id/download` | دانلود امن (اجرای canRelease در هر درخواست؛ گرنت اتمیک؛ X-Accel-Redirect) | canRelease |

## پورتال راننده (بدون حساب کاربری)

| متد | مسیر | شرح | احراز |
|---|---|---|---|
| POST | `/api/driver/verify-link` | اعتبارسنجی توکن | توکن |
| POST | `/api/driver/request-otp` | درخواست کد (rate limit) | توکن |
| POST | `/api/driver/verify-otp` | تأیید کد + ساخت نشست | توکن + OTP |
| GET | `/api/driver/waybill` | پرونده + گام فعلی + کارت‌های فعال | driver_session |
| POST | `/api/driver/commitment/accept` | پذیرش تعهدنامه + امضا (گام ۲ — پیش از پرداخت) | driver_session |
| POST | `/api/driver/payment/gateway/init` | شروع پرداخت درگاهی (مبلغ از رکورد جاری) | driver_session + گارد تعهدنامه |
| GET/POST | `/api/payments/gateway/callback/:provider` | بازگشت درگاه → وریفای server-to-server | عمومی (state) |
| POST | `/api/driver/payment` | ثبت پرداخت دستی + کارت مقصد + تراکنش/رسید | driver_session + گارد تعهدنامه |
| GET | `/api/driver/download` | دریافت PDF آزادشده | driver_session + canRelease |

## اعلان‌ها، کاربران، سلامت

| متد | مسیر | شرح | مجوز |
|---|---|---|---|
| GET | `/api/notifications` · `POST /:id/read` | مرکز اعلان | session |
| GET | `/api/sms-monitor` · `POST /:id/resend` | پنل پیامک ناموفق + ارسال مجدد | OPERATOR |
| GET/POST | `/api/users` · `/:id/permissions` | کاربران + واگذاری مجوز | MANAGE_USERS / DELEGATE_REVIEW |
| GET | `/api/health` | سلامت سرویس | TECH_ADMIN |

## فرانت‌اند — نقشهٔ مسیرها

```text
(auth)/login
(panel)/{dashboard, waybills[/id], imports, documents, payments/review-queue,
          refunds, notifications, sms-monitor, settings[/gateways], bank-cards,
          users, commitments, tech/health}
driver: /d/[token]/{page, verify, waybill, commitment, payment[/status], done}
```

- فهرست/جزئیات = Server Components؛ فرم‌ها = Client + RHF/Zod؛ صف‌های زنده = polling ۳۰ ثانیه‌ای (WebSocket در MVP رد شده)؛ همهٔ جدول‌ها: صفحه‌بندی سروری + فیلتر در URL.
- گام فعلی راننده **از سرور** (فاز مشتق) محاسبه می‌شود — نه state محلی؛ پیش‌نمایش فرم در localStorage؛ قفل دکمه پس از ثبت.


---

## مستندات مرتبط

- [معماری کلی](overview.md)
- [قواعد کسب‌وکار](../product/business-rules.md) — خطاهای کسب‌وکاری هر endpoint
- [درگاه‌های پرداخت](../integrations/payment-gateways.md) — endpointهای gateway/init و callback
- [راهنمای UI/UX](../frontend/ui-ux-rtl-guidelines.md) — صفحات مصرف‌کنندهٔ API
