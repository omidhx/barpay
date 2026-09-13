# ناورداهای سیستم (Invariants) — فایل اجرایی

> **منبع:** سند مادر v2.5 فصل ۵.۴ و ۷.۴. هر قاعده در سه لایه اعمال می‌شود:
> **سرویس (ماشین وضعیت / canRelease) + دیتابیس (CHECK/ایندکس/تریگر) + تست**.
> هیچ گذار مجاز نیست این ناورداهای بین‌محوری را بشکند.

## ناورداهای هسته (نقض = باگ بحرانی)

**I-1. آزادسازی مشروط کامل**
`release_status ∈ {ELIGIBLE, AUTHORIZED, RELEASED}` ⇒
`payment_status ∈ {APPROVED, NOT_REQUIRED}` ∧
`commitment_status ∈ {ACCEPTED, NOT_REQUIRED}` ∧
`document_status = VERIFIED`
→ قفل در CHECK سطری (گذار دولحظه‌ای در یک UPDATE واحدِ همان سطر؛ دو UPDATE جدا ممنوع).

**I-2. بارنامهٔ باطل هرگز آزاد نمی‌شود**
`shipment_status ∈ {CANCELLED, ARCHIVED}` ⇒ `release_status ∉ {AUTHORIZED, RELEASED}` (CHECK).

**I-3. تنها یک مبلغ جاری**
`waybills.current_amount_id` همیشه به رکورد `waybill_amounts` با `is_current=true` همان بارنامه اشاره می‌کند؛ ایندکس یکتای جزئی تضمین می‌کند حداکثر یک رکورد `is_current` وجود دارد. هیچ مسیری خارج از این جدول مبلغ قابل پرداخت نمی‌نویسد.

**I-4. یک PDF فعال به‌ازای بارنامه (سیاست ۱:۱)**
ایندکس یکتای جزئی روی `documents(waybill_id) WHERE WAYBILL_PDF AND matching_status<>'REPLACED'`.

**I-5. حداکثر یک مجوز تحویل برقرار**
`release_authorizations(waybill_id) WHERE revoked_at IS NULL` یکتا.

**I-6. حداکثر یک تلاش باز درگاه به‌ازای بارنامه**
`gateway_transactions(waybill_id) WHERE status IN ('INITIATED','RETURNED','UNKNOWN')` یکتا — «پرداخت جزئی نداریم» + جلوگیری از دو تراکنش هم‌زمان.

**I-7. مرجع درگاه یکتا**
`(organization_id, provider, provider_reference) WHERE NOT NULL` یکتا — تکرار ساختاراً رد (`GATEWAY_REFERENCE_DUPLICATE`).

**I-8. یک درگاه فعال به‌ازای سازمان**
`payment_gateways(organization_id) WHERE is_active=TRUE` یکتا؛ تغییر ارائه‌دهنده در یک تراکنش (غیرفعال‌کردن قبلی + فعال‌سازی جدید) + audit `GATEWAY_CONFIG_CHANGED`.

**I-9. پرداخت درگاهی به‌گره‌خورده به مرجع**
`method='GATEWAY'` ⇒ `gateway_provider` ∧ `gateway_transaction_id` NOT NULL ∧ `auto_verified_at` پر (CHECK)؛ روش‌های دیگر هرگز `auto_verified_at` ندارند.

**I-10. سقف بازگشت وجه**
جمع بازگشت‌های غیر REJECTED ≤ جمع پرداخت‌های APPROVED همان بارنامه (تریگر + advisory lock).

**I-11. یکتایی شناسهٔ بارنامه**
`(organization_id, waybill_number, COALESCE(waybill_year,0))` یکتا؛ رکورد لغوشده کلید را اشغال نگه می‌دارد (ورود مجدد همان شماره → DUPLICATE، نه رکورد دوم)؛ شناسهٔ تغییریافتن‌پذیر نیست (تریگر).

**I-12. یک رکورد رانندهٔ فعال به‌ازای موبایل در سازمان**
`drivers(organization_id, mobile) WHERE status='ACTIVE'` یکتا.

**I-13. یک قالب تعهدنامهٔ پیش‌فرض فعال**
`commitment_versions(organization_id) WHERE status='ACTIVE' AND is_default=TRUE` یکتا؛ body/variables/hash نسخه تغییرناپذیر (تریگر).

**I-14. تعهدنامهٔ الزامی پیش از پرداخت (ENFORCED)**
در ENFORCED، هیچ پرداختی (دستی/درگاهی) با `commitment_status ≠ ACCEPTED` ثبت نمی‌شود (`COMMITMENT_NOT_ACCEPTED`). در `RESIDUAL_DUE` پذیرش قبلی معتبر است — امضای مجدد ممنوع.

**I-15. بازگشت وجه فقط از مسیر ابطال/۶.۹**
`payment_status ∈ {REFUND_*}` ⇒ `release_status` مسدود می‌ماند؛ حذف فیزیکی فرزندان ممنوع (ممیزی).

**I-16. تردستی مالی idempotent**
تأیید دوباره/هم‌زمان پرداخت، آزادسازی مجدد یا اصلاح دوباره — هیچ‌کدام اثر مالی تکراری نمی‌سازند: شرط وضعیت قبلی + `version` + قیدهای یکتای idempotency (سخت: `payments.idempotency_key`، دامنه‌ای: `idempotency_records`).

## لایهٔ اعمال و آزمون هر ناوردا

| ناوردا | سرویس | دیتابیس | تست |
|---|---|---|---|
| I-1..I-2 | canRelease + ماشین وضعیت | CHECK سطری | INSERT/UPDATE ناسازگار در سطح DB رد شود |
| I-3 | سرویس مبلغ | ایندکس یکتای جزئی | دو رکورد is_current → برخورد قید |
| I-4 | سرویس اسناد | ایندکس یکتای جزئی | فایل دوم → ALREADY_ATTACHED |
| I-5 | سرویس تحویل | ایندکس یکتای جزئی | صدور هم‌زمان دو مجوز → برخورد |
| I-6..I-9 | آداپتر/فرآیند ۶.۱۰ | ایندکس/CHECK | دو init هم‌زمان، مرجع تکراری، روش دستی با auto_verified_at |
| I-10 | سرویس ۶.۹ | تریگر | ثبت بازگشت بیش از سقف در DB رد شود |
| I-11 | import | قید یکتا + تریگر | هم‌شماره با سال تهی → DUPLICATE؛ UPDATE شناسه → خطا |
| I-14 | گارد endpoint | — (منطق سرویس) | ثبت پرداخت قبل از پذیرش → `COMMITMENT_NOT_ACCEPTED` |
| I-16 | گذار شرطی | قیدهای یکتا | دو تراکنش هم‌زمان با تاخیر تزریقی (deterministic) |

## قواعد جانبی مکمل

- **گذار مالی به صف نمی‌رود:** تأیید/اصلاح/بازگشت/آزادسازی در خود درخواست و تراکنشی اجرا می‌شوند؛ صف فقط پیامک/فایل/گزارش/پاک‌سازی/استعلام UNKNOWN.
- **تک‌سطح جهش مالی:** عملیات مالی حساس فقط از Route Handler (با `Idempotency-Key`)؛ Server Action فقط فرم‌های غیرمالی.
- **`organization_id` همیشه از نشست سرور** (+ تزریق با Prisma Client Extension روی کوئری‌های جداول سازمان‌دار).
- **زنجیرهٔ audit دستکاری‌ناپذیر:** append-only + `row_hash`/`prev_hash` + لنگر off-site هر ۱۵ دقیقه.
- **توکن‌ها و OTP هرگز خام ذخیره نمی‌شوند** (HMAC-SHA256 + مقایسهٔ constant-time)؛ پاک‌سازی دادهٔ حساس از لاگ/داشبورد فنی (موبایل `0912***1234`، PAN ماگسک).


---

## مستندات مرتبط

- [مدل داده](data-model.md) — قیدهای فیزیکی ۷.۴ اینجا پیاده می‌شوند
- [گذار وضعیت‌ها](state-transitions.md)
- [مدل تهدید](../security/threat-model.md) — سناریوهای نقض ناورداها
- [AGENTS.md تست](../../tests/AGENTS.md) — تست‌های الزامی ناورداها
