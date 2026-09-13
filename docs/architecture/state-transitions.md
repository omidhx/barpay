# گذار وضعیت‌ها (State Transitions) — فایل اجرایی

> **منبع:** سند مادر v2.5 فصل ۵ و ۶. هر گذار فقط از سرویس مرکزی ماشین وضعیت
> (`src/modules/<domain>/state-machine.ts`) انجام می‌شود؛ هیچ کدی مستقیم ستون وضعیت را
> آپدیت نمی‌کند. هر گذار: داخل تراکنش + شرط وضعیت قبلی + `version` + ثبت `audit_logs`.

## ۱. پنج محور مستقل روی waybills

```text
shipment_status:    DRAFT → IMPORTED → (VALIDATION_FAILED) → READY_FOR_DRIVER →
                    DRIVER_NOTIFIED → DRIVER_VIEWED → COMPLETED | CANCELLED | ARCHIVED
document_status:    NOT_UPLOADED → UPLOADED → MATCHED | MISMATCHED | PENDING_REVIEW →
                    VERIFIED | REPLACEMENT_PENDING | CORRUPTED
payment_status:     NOT_REQUIRED | NOT_SUBMITTED → SUBMITTED → UNDER_REVIEW →
                    APPROVED | REJECTED | DISCREPANCY_REVIEW | RESIDUAL_DUE |
                    REFUND_RECORDED → REFUND_SETTLED | CANCELLED
commitment_status:  NOT_REQUIRED | PENDING → ACCEPTED | DECLINED | RE_ACCEPT_REQUIRED
release_status:     BLOCKED → ELIGIBLE → AUTHORIZED → RELEASED | REVOKED
```

- ردیف صفر/صفر اکسل: هیچ رکوردی ساخته نمی‌شود (فقط `import_rows = SKIPPED_PREVIOUSLY_CANCELLED`).
- وضعیت‌های چرخهٔ درگاه (INITIATED/RETURNED/VERIFIED/FAILED/CANCELLED/EXPIRED/UNKNOWN) در جدول مستقل `gateway_transactions` زندگی می‌کنند — محور `payment_status` فقط نتیجهٔ نهایی را منعکس می‌کند.
- نگاشت واژگان: `payment_refunds.RECORDED` ≡ `REFUND_RECORDED` و `SUPERVISOR_APPROVED` ≡ `REFUND_SETTLED`.

## ۲. قواعد گذار (خلاصهٔ فصل ۵.۴)

- سند بدون PDF تأییدشده هرگز آزاد نمی‌شود.
- **تعهدنامه پیش از پرداخت (ENFORCED):** endpoint ثبت پرداخت (دستی و درگاهی) بدون `commitment_status=ACCEPTED` → `COMMITMENT_NOT_ACCEPTED`؛ SHADOW فقط ثبت؛ OFF → NOT_REQUIRED.
- پرداخت دستی خودکار تأیید نمی‌شود؛ استثنا: درگاه با وریفای موفق سمت سرور → مستقیم `APPROVED`.
- رد پرداخت بدون دلیل ممنوع (فیلد الزامی).
- ثبت پرداخت روی بارنامهٔ CANCELLED/ARCHIVED → `WAYBILL_NOT_ACTIVE`.
- مبلغ پس از پرداخت فقط از مسیر اصلاح (۶.۵) + رویداد `AMOUNT_CORRECTED`.
- در `RESIDUAL_DUE` تعهدنامهٔ قبلی معتبر است؛ آزادسازی تا تأیید مابقی مسدود.
- بازگشت وجه فقط ثبت دستی + تأیید سرپرست؛ هیچ گذار خودکار مالی وجود ندارد.
- هم‌زمانی: idempotency رویداد — تأیید و تعهدنامهٔ هم‌زمان نتیجهٔ تکراری نمی‌سازند.

## ۳. فاز مشتق (نمای داشبورد و پورتال) — تابع واحد `lib/waybills/phase.ts`

| فاز نمایشی | شرط محاسبه |
|---|---|
| `IMPORTED` | shipment=IMPORTED/VALIDATION_FAILED، document=NOT_UPLOADED |
| `PDF_ATTACHED` | document=VERIFIED، shipment=READY_FOR_DRIVER |
| `AWAITING_COMMITMENT` (۲.۵ — **پیش از پرداخت**) | shipment=DRIVER_NOTIFIED/DRIVER_VIEWED، commitment=PENDING/DECLINED، payment=NOT_SUBMITTED |
| `AWAITING_PAYMENT` | shipment=DRIVER_NOTIFIED/DRIVER_VIEWED، commitment=ACCEPTED/NOT_REQUIRED، payment=NOT_SUBMITTED |
| `PAYMENT_UNDER_REVIEW` | payment=SUBMITTED/UNDER_REVIEW |
| `PAYMENT_REJECTED` | payment=REJECTED |
| `RESIDUAL_PAYMENT` | payment=RESIDUAL_DUE |
| `REFUND_RECORDED` / `REFUND_SETTLED` | همان مقادیر payment |
| `READY_FOR_RELEASE` | commitment=ACCEPTED، release=ELIGIBLE |
| `RELEASED` | release=RELEASED |
| `COMPLETED` | shipment=COMPLETED |
| `CANCELLED` / `ARCHIVED` | shipment همان‌ها |
| `NEEDS_ATTENTION` | **هر ترکیب فهرست‌نشده** (default صریح، بدون حدس) |

- فاز ذخیره نمی‌شود؛ داشبورد، فهرست و پورتال همگی از همان تابع می‌خوانند.
- فیلترهای پرتکرار: کوئری روی ستون‌های ایندک‌شده (generated column فقط در آینده در صورت نیاز).
- ترتیب نمایشی راننده (۲.۵): مشاهده ← AWAITING_COMMITMENT ← AWAITING_PAYMENT ← تأیید ← READY_FOR_RELEASE ← RELEASED.

## ۴. وضعیت‌های راکد (SLA)

- >۱۴ روز در `AWAITING_COMMITMENT`/`AWAITING_PAYMENT` → اعلان + کارت «موارد کهنه»؛ >۳۰ روز → escalate به سرپرست.
- پرداخت >۴ ساعت در `UNDER_REVIEW` → اعلان سرپرست (پیش‌فرض؛ قابل تنظیم).
- حذف/ابطال خودکار **وجود ندارد** — تصمیم همیشه انسانی و ثبت‌شده.

## ۵. قاعدهٔ مرکزی دسترسی به PDF — `canRelease(waybillId, sessionId)`

```text
دانلود مجاز ⇔ رکورد فعال
            ∧ PDF متصل و VERIFIED
            ∧ payment ∈ {APPROVED, NOT_REQUIRED} (بدون مابقی باز)
            ∧ commitment ∈ {ACCEPTED, NOT_REQUIRED}
            ∧ مجوز تحویل برقرار (AUTHORIZED/RELEASED)
            ∧ نشست معتبر
```

- خروجی علاوه بر بولین: فهرست کدهای پایدار شرط‌های برقرارنشده (`PAYMENT_NOT_SETTLED`، `COMMITMENT_NOT_ACCEPTED`، `DOCUMENT_NOT_VERIFIED`، …).
- تابع خالص و **تنها مرجع تصمیم** — هیچ endpoint دیگری حق تکرار منطقش را ندارد.
- در هر درخواست دانلود اجرا می‌شود؛ گرنت اتمیک: ارزیابی + قفل سطر + درج `document_access_events` + استریم در **یک تراکنش** (بستن TOCTOU).
- بدون نسخهٔ ACTIVE قالب تعهدنامه (در صورت لزوم): لینک اصلاً صادر نمی‌شود (`COMMITMENT_NO_ACTIVE_VERSION`).

## ۶. الگوی گذار امن (SQL شرطی)

```sql
UPDATE payments
SET status='APPROVED', reviewed_by=:reviewer_id, reviewed_at=now()
WHERE id=:id AND status IN ('SUBMITTED','UNDER_REVIEW');
```

- صفر ردیف + وضعیت جاری = همان نتیجه → پاسخ idempotent موفق؛
- صفر ردیف + وضعیت ناسازگار → `409 PAYMENT_STATE_CONFLICT` با وضعیت جاری (نه 500، نه موفقیت خاموش)؛
- ایزولاسیون READ COMMITTED + قفل سطری/version؛ خطای 40P01/40001 → حداکثر ۳ retry با backoff ۲۰۰/۴۰۰/۸۰۰ms.

## ۷. چرخهٔ gateway_transactions (فرآیند ۶.۱۰)

```text
INITIATED → RETURNED → VERIFIED   (وریفای موفق؛ payments APPROVED خودکار)
INITIATED → RETURNED → FAILED     (وریفای ناموفق / مغایرت مبلغ)
INITIATED → CANCELLED             (تغییر مبلغ حین تلاش — AMOUNT_CHANGED / ابطال)
INITIATED → EXPIRED               (job انقضا؛ تلاش باز >۲۰ دقیقه)
INITIATED/RETURNED → UNKNOWN      (بی‌پاسخ؛ استعلام هر ۱۰ دقیقه تا ۲۴ ساعت → FOUND_VERIFIED / FOUND_FAILED / STILL_UNKNOWN)
```

- در هر لحظه حداکثر یک تلاش باز به‌ازای بارنامه (ایندکس یکتای جزئی).
- callback تکراری روی رکورد VERIFIED → پاسخ موفق بی‌اثر (نه 500، نه اثر دوم).
- مبلغ snapshot در `amount`؛ مقایسهٔ وریفای با همین عدد (ریال).

## مثال قبول/رد

- ✅ دو بررسی‌کنندهٔ هم‌زمان: اولی APPROVED، دومی `409 PAYMENT_STATE_CONFLICT`
- ✅ رد پذیرش تعهدنامه در ENFORCED: `PENDING` می‌ماند + اعلان متصدی + پرداخت رد با `COMMITMENT_NOT_ACCEPTED`
- ✅ UNKNOWN بعد از ۳ استعلام ناموفق: همچنان UNKNOWN (هرگز FAILED فرض نمی‌شود) + دکمهٔ پرداخت مجدد غیرفعال
- ❌ آپدیت مستقیم `waybills.payment_status` از یک Route Handler (دور زدن ماشین وضعیت)
- ❌ نمایش فاز «در انتظار پرداخت» برای پروندهٔ با `commitment=PENDING` در ENFORCED (فاز درست: AWAITING_COMMITMENT)


---

## مستندات مرتبط

- [مدل داده](data-model.md) — جداول پشتیبان محورهای وضعیت
- [ناورداها](invariants.md) — قیدهای بین‌محوری
- [قواعد کسب‌وکار](../product/business-rules.md) — تصمیم‌های موثر بر گذارها
- [سند مادر v2.5](../master-spec/barnameh-pay-master-doc-2.5.md) — فصل ۵
