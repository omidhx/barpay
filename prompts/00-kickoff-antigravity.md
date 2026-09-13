# پرامپت شروع پروژه در Google Antigravity

> این متن را به‌عنوان **اولین پیام** به ایجنت در نمای Manager بفرستید.
> قبل از ارسال: این کل پوشه (یا محتوایش) باید در پوشهٔ پروژه باز‌شده در Antigravity باشد
> (شامل `AGENTS.md`، `.agents/rules/`، `docs/`).

---

## متن پرامپت (کپی کنید)

شروع یک پروژهٔ واقعی به نام barnameh-pay (بارنامه‌پی) — سامانهٔ مدیریت بارنامه و پرداخت راننده برای شرکت‌های حمل‌ونقل ایران.

قبل از هر کاری، مستندات پروژه را کامل بخوان:
۱. [AGENTS.md](../AGENTS.md) — قواعد غیرقابل مذاکرهٔ پروژه (پول BIGINT ریال، تعهدنامه قبل از پرداخت، وریفای درگاه فقط server-to-server، RTL فارسی).
۲. چهار فایل اجرایی که تنها ورودی پیاده‌سازی‌اند:
   - [docs/product/business-rules.md](../docs/product/business-rules.md)
   - [docs/architecture/data-model.md](../docs/architecture/data-model.md)
   - [docs/architecture/state-transitions.md](../docs/architecture/state-transitions.md)
   - [docs/architecture/invariants.md](../docs/architecture/invariants.md)
۳. [docs/architecture/api-contracts.md](../docs/architecture/api-contracts.md) و [docs/frontend/ui-ux-rtl-guidelines.md](../docs/frontend/ui-ux-rtl-guidelines.md)
۴. اگر به جزئیات بیشتر نیاز داشتی: [docs/master-spec/barnameh-pay-master-doc-2.5.md](../docs/master-spec/barnameh-pay-master-doc-2.5.md) (سند جامع فارسی ~۳۷۰۰ خط — منبع سیاست).

سپس یک **Artifact از نوع Plan** بساز که شامل این‌ها باشد:
- تأیید اینکه قواعد کلیدی را خلاصه کرده‌ای (زنجیرهٔ راننده، زنجیرهٔ مبلغ با دو مثال طلایی ۸۰٬۶۸۶٬۴۴۵→۸۰٬۷۰۰٬۰۰۰ و ۱۳٬۷۱۲٬۵۰۰→۱۳٬۷۵۰٬۰۰۰، پنج محور وضعیت، آداپتر PaymentProvider با شش ارائه‌دهنده)
- فهرست مراحل فاز ۰ و فاز ۲ (طبق [TODO.md](../TODO.md)): ابتدا مدل داده + Import + ماشین وضعیت — نه احراز هویت
- ساختار پوشه‌ها طبق AGENTS.md
- سؤال‌های بازت (اگر چیزی در مستندات مبهم بود)

منتظر تأیید من بمان. هیچ کدی ننویس تا Plan تأیید شود.

بعد از تأیید، فقط فاز ۰ را اجرا کن: پروژهٔ Next.js 15 + TypeScript + Prisma + Tailwind را initialize کن، AGENTS.md و docs/ را در ریشه نگه دار، eslint/typecheck/CI پایه را راه بینداز، و ساختار src/modules/ را با پوشه‌های خالی و README هر ماژول بساز. در پایان Walkthrough بده.

---

## بعد از تأیید Plan (گردش‌کار روزانه)

1. **فاز به فاز جلو بروید** — ترتیب و شرط عبور هر فاز در [TODO.md](../TODO.md).
2. برای هر قابلیت، قبل از سپردن کار به ایجنت، «کارت اجرا» بسازید (الگوی فصل ۱۳.۶ سند مادر):

```text
قابلیت: تأیید پرداخت (دستی)
هدف: کاربر مجاز تصمیم تأیید/رد/مغایرت را ثبت کند
ورودی/خروجی: payment_id, decision, reason → payments.status + payment_reviews + audit
مجوز: VERIFY_PAYMENT (سمت سرور)
تغییر مدل داده: ندارد (جداول موجود)
حالت موفق: SUBMITTED → APPROVED (تراکنشی + idempotent)
حالت خطا: بدون مجوز=403؛ وضعیت ناسازگار=409 PAYMENT_STATE_CONFLICT؛ رد بدون دلیل=422
سوءاستفاده: دو بررسی‌کنندهٔ هم‌زمان؛ تکرار همان درخواست؛ تلاش برای تغییر پس از تأیید
تست‌های الزامی: unit (گذار شرطی) + integration (دو تراکنش هم‌زمان با تاخیر تزریقی) + ماتریس دسترسی
نباید تغییر کند: قواعد canRelease، سایر محورهای وضعیت، فرمت پاسخ
```

3. خروجی هر ایجنت را در **Artifact Review** ببینید (Diff + Walkthrough)؛ فقط با تست سبز merge کنید.
4. اگر ایجنت قاعده‌ای را نقض کرد، به شمارهٔ همان قاعده در AGENTS.md/docs ارجاع بدهید و کارت را برگردانید — با خودتان اصلاحش نکنید تا عادت نکند.
5. مواردی که به دادهٔ بیرونی وابسته‌اند (متن تعهدنامه، اکسل نمونه، قرارداد درگاه، تأیید قالب پیامک) تا تأمین artifact فقط در staging و با flag خاموش — بند Definition of Ready در `TODO.md`.

## نکته‌های Antigravity

- از نمای **Manager** می‌توانید چند ایجنت موازی روی ماژول‌های مستقل بفرستید (مثلاً یکی درگاه‌ها، یکی Import) — اما منطق مالی/تحویل را همیشه تک‌ایجنت و با بازبینی انسانی نگه دارید.
- قواعد `.agents/rules/` به‌صورت خودکار بر اساس glob فایل‌ها فعال می‌شوند (frontend/payments/database/testing) — نیازی به تکرارشان در پرامپت نیست.
- برای جست‌وجوی سریع در مستندات از @docs/... در ورودی ایجنت استفاده کنید.
