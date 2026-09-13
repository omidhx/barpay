# مدل داده (Data Model) — فایل اجرایی

> **منبع:** سند مادر v2.5 فصل ۷. مبنای پیاده‌سازی Prisma + migrations.
> PostgreSQL **الزامی** است — ایندکس‌های جزئی، تریگرها، ستون تولیدشده و CHECK ها فقط در PG معنا دارند.

## ۱. اصول

- کلید داخلی مستقل از شمارهٔ بارنامه (`id` هرگز از دادهٔ کسب‌وکار گرفته نمی‌شود).
- کلید یکتای بارنامه: `(organization_id, waybill_number, waybill_year_key)`.
- تاریخ‌ها UTC؛ نمایش شمسی؛ زمان ثبت سمت سرور مرجع است.
- حذف مالی = لغو/اصلاح ثبت‌شده (soft state)، هرگز DELETE؛ لغو، مقدار وضعیت است نه tombstone.
- مبالغ: `BIGINT` ریال؛ در TS/Zod با `bigint` (JSON: string).
- موجودیت‌های stateful ستون `version` دارند؛ UPDATE فقط با `WHERE version = :expected` (ناموفق = 409).
- `audit_logs` append-only برای نقش برنامه (فقط INSERT/SELECT).
- FK مرکب `(organization_id, waybill_id)` برای جداول فرزند بارنامه؛ `(organization_id, payment_id)` برای فرزندان پرداخت.
- **منبع حقیقت قیدهای فیزیکی = فایل‌های SQL migration** (Prisma schema نمی‌تواند ایندکس جزئی/تریگر/CHECK تولیدشده را بیان کند)؛ CI با `prisma migrate diff` مغایرت را می‌شکند.

## ۲. فهرست موجودیت‌ها (۲۶ جدول)

`organizations` · `organization_settings` · `excel_column_mappings` · `users` ·
`user_permissions` · `drivers` · `waybills` · `waybill_amounts` · `import_batches` ·
`import_rows` · `documents` · `payments` · `payment_reviews` · `payment_refunds` ·
`payment_gateways` (۲.۵) · `gateway_transactions` (۲.۵) · `bank_cards` (۲.۵) ·
`driver_access_links` · `driver_sessions` · `otp_challenges` ·
`tech_admin_access_requests` · `commitment_versions` · `commitment_acceptances` ·
`release_authorizations` · `document_access_events` · `notification_jobs` ·
`notifications` · `idempotency_records` · `audit_logs`

راننده در `users` ثبت نمی‌شود (فقط لینک + OTP).

## ۳. جداول کلیدی (فیلدهای مهم)

### waybills (رکورد اصلی)
`id` · `organization_id` · `waybill_number` (نرمال‌شده) · `waybill_year` (nullable) ·
`waybill_year_key` = `COALESCE(waybill_year,0) STORED` · `driver_id` ·
`driver_name_raw` / `driver_mobile_raw` / `plate_number_raw` (snapshot ورود) ·
`issue_date` · `origin` / `destination` · `gross/commission/deductions/net_amount` (خام اکسل — بدون تفسیر مالی) ·
`current_amount_id` → `waybill_amounts` ·
**پنج محور وضعیت:** `shipment_status` · `document_status` · `payment_status` ·
`commitment_status` · `release_status` ·
`source_import_id` · `created_by` · timestamps

> شناسهٔ بارنامه (`waybill_number`/`waybill_year`) پس از ایجاد **تغییرناپذیر** — اصلاح = ابطال و ثبت مجدد.

### waybill_amounts (تنها منبع مبلغ قابل پرداخت)
`raw_excel_amount` · `rounded_amount` · `surcharge_amount` · `amount` (BIGINT ریال) ·
`source` (EXCEL_CALCULATED/OPERATOR_ENTERED/OPERATOR_CORRECTION) ·
`reason` (برای CORRECTION اجباری — CHECK) · `is_current` (حداکثر یک TRUE — ایندکس یکتای جزئی) ·
`status` (DRAFT/APPROVED/SUPERSEDED) · `approved_by/at`

### payments
`organization_id` · `waybill_id` (FK مرکب) · `parent_payment_id` · `is_residual` ·
`waybill_amount_id` (snapshot مبلغ هنگام ثبت — پشتیبان گارد AMOUNT_CHANGED) ·
`idempotency_key` (ایندکس یکتای جزئی WHERE NOT NULL) · `version` ·
`method` (CARD_TO_CARD/POS/CASH/BANK_TRANSFER/GATEWAY/OTHER) · `amount` (BIGINT) ·
`tracking_number` · `payout_card_id` → `bank_cards` (الزامی برای CARD_TO_CARD) ·
`gateway_provider` + `gateway_transaction_id` (جفت — CHECK) · `auto_verified_at` (فقط GATEWAY) ·
`paid_at` (ادعاشده) · `receipt_document_id` · `submitted_by_type/id` ·
`status` (محور ۳) · `reviewed_by/at` · `rejection_reason` (الزامی در رد)

### payment_gateways (۲.۵)
`organization_id` · `provider` (SEP/BPM/PASARGAD/SADAD/ZARINPAL/ZIBAL) ·
`credentials_json` (AES-256-GCM؛ کلید از env) · `mode` (LIVE/SANDBOX — SANDBOX فقط staging) ·
`is_active` (حداکثر یک ACTIVE به‌ازای سازمان — ایندکس یکتای جزئی) ·
`last_health_check_at` · تغییر ارائه‌دهنده در یک تراکنش + رویداد `GATEWAY_CONFIG_CHANGED`

### gateway_transactions (۲.۵ — منبع حقیقت درگاه)
`organization_id` + `waybill_id` (FK مرکب) · `payment_id` (پس از موفقیت) ·
`payment_gateway_id` · `provider` (snapshot) · `provider_reference` (Authority/trackId/RefNum/refId/Token) ·
`state` (CSPRNG ≥۱۲۸bit برای bind به callback) · `amount` (ریال — snapshot) ·
`waybill_amount_id` · `status` (INITIATED/RETURNED/VERIFIED/FAILED/CANCELLED/EXPIRED/UNKNOWN) ·
`error_code` · `init/callback/verify_payload_json` (سه payload کامل) ·
`inquiry_count` · `expires_at` (پیش‌فرض ۲۰ دقیقه) · `version`

> PAN کارت راننده در پاسخ‌های درگاه پیش از ذخیره **ماگسک** می‌شود (`6104-****-****-1234`).

### bank_cards (۲.۵)
`organization_id` · `bank_code` (فهرست ثابت بانک‌ها — مبنای آیکون `public/banks/{bank_code}.svg` و نام فارسی) ·
`holder_first_name` / `holder_last_name` · `card_number` (۱۶ رقم، Luhn) ·
`account_number` · `iban` (`IR` + ۲۴ رقم، MOD-97) · `is_active` · `display_order` · `notes` (داخلی)

### commitment_versions / commitment_acceptances
نسخه: `title` · `template_key` · `variables_json` · `body` · `content_hash` ·
`status` (DRAFT/ACTIVE/RETIRED) · `is_default` (حداکثر یک ACTIVE — ایندکس یکتای جزئی) —
`body`/`variables_json`/`content_hash` پس از ایجاد تغییرناپذیر (تریگر).

پذیرش: `commitment_version_id` · `content_hash` · `rendered_text` (snapshot کامل) ·
`signature_document_id` · `mobile_verified` · `session_id` · `signed_at` (سرور) · `ip` · `user_agent`

### documents
`waybill_id` · `document_type` (WAYBILL_PDF/PAYMENT_RECEIPT/DRIVER_COMMITMENT/SIGNATURE/OTHER) ·
`storage_key` (الگو: `organizations/{orgId}/waybills/{waybillId}/documents/{uuid}.pdf`) ·
`sha256_hash` · `extracted_waybill_number` · `matching_method` (FILENAME/MANUAL) ·
`matching_status` (نتایج ۶.۲؛ REPLACED برای جایگزین‌شده) · `visibility` (PRIVATE)

### otp_challenges / driver_access_links / driver_sessions
- توکن لینک و کد OTP هرگز خام ذخیره نمی‌شوند — HMAC-SHA256 + مقایسهٔ constant-time.
- نشست راننده: انقضای مطلق ۲ ساعت؛ ابطال لینک/مجوز = ابطال فوری همهٔ نشست‌های همان لینک.

### idempotency_records
`(organization_id, endpoint, idempotency_key)` یکتا · `request_hash` ·
`response_status/body` · TTL ۲۴ ساعت · درج با `ON CONFLICT DO NOTHING` (مسابقهٔ اتمیک)؛
همان کلید + هش متفاوت = 409 `IDEMPOTENCY_KEY_REUSED`.

### audit_logs
`actor_type/id` · `action` · `entity_type/id` · `before/after_json` ·
`correlation_id` · `prev_hash` + `row_hash` (زنجیره) · `ip` · `user_agent` —
لنگر off-site هر ۱۵ دقیقه (تُرپل هش رأس + تعداد + زمان، فقط-الحاق).

## ۴. قیدهای فیزیکی — کامل (فصل ۷.۴)

**ایندکس‌های یکتای جزئی:**
1. `waybill_amounts (waybill_id) WHERE is_current = TRUE`
2. `payments (idempotency_key) WHERE idempotency_key IS NOT NULL`
3. `payments (organization_id, method, tracking_number) WHERE tracking_number IS NOT NULL AND method IN ('CARD_TO_CARD','POS','BANK_TRANSFER')`
4. `documents (waybill_id) WHERE document_type='WAYBILL_PDF' AND waybill_id IS NOT NULL AND matching_status <> 'REPLACED'` (سیاست ۱:۱)
5. `drivers (organization_id, mobile) WHERE status='ACTIVE'`
6. `commitment_versions (organization_id) WHERE status='ACTIVE' AND is_default=TRUE`
7. `release_authorizations (waybill_id) WHERE revoked_at IS NULL`
8. `gateway_transactions (organization_id, provider, provider_reference) WHERE provider_reference IS NOT NULL`
9. `gateway_transactions (waybill_id) WHERE status IN ('INITIATED','RETURNED','UNKNOWN')` (یک تلاش باز)
10. `payment_gateways (organization_id) WHERE is_active=TRUE` (یک درگاه فعال)

**یکتایی‌های ساده:** `organizations.slug`؛ `users (organization_id, mobile)`؛
`waybills (organization_id, waybill_number, waybill_year_key)`؛
`driver_access_links.token_hash`؛ `commitment_acceptances (waybill_id, commitment_version_id)`؛
`import_batches.file_hash` (در سازمان)؛ `waybills (organization_id, id)` + `payments (organization_id, id)` (پایهٔ FK مرکب)

**قیدهای CHECK:**
- `waybills`: آزادسازی کامل — `release_status IN ('ELIGIBLE','AUTHORIZED','RELEASED')` ⇒ `payment_status IN ('APPROVED','NOT_REQUIRED')` AND `commitment_status IN ('ACCEPTED','NOT_REQUIRED')` AND `document_status='VERIFIED'`
- `waybills`: ابطال-آزادسازی — `release_status IN ('AUTHORIZED','RELEASED')` ⇒ `shipment_status NOT IN ('CANCELLED','ARCHIVED')`
- `payments`: جفت درگاه — `gateway_provider`/`gateway_transaction_id` هر دو NULL یا هر دو NOT NULL
- `payments`: `method='GATEWAY'` ⇒ جفت درگاه NOT NULL و `auto_verified_at` پر؛ روش‌های دیگر هرگز `auto_verified_at` پر نمی‌کنند
- `waybill_amounts`: `source='OPERATOR_CORRECTION'` ⇒ `reason` NOT NULL
- `bank_cards`: `card_number ~ '^[0-9]{16}$'` و `iban ~ '^IR[0-9]{24}$'` (+checksum MOD-97 در سرویس؛ Luhn در Zod و سرویس)

**تریگرها:**
- `check_refund_ceiling` (BEFORE INSERT روی `payment_refunds`): سقف بازگشت ≤ جمع پرداخت‌های APPROVED منهای بازگشت‌های غیر REJECTED؛ ابتدای کار `pg_advisory_xact_lock(waybill_id)`
- `waybill_identity_immutable` (BEFORE UPDATE روی `waybills`): تغییر شماره/سال = خطا
- `commitment_version_immutable`: body/variables/hash تغییرناپذیر

**ستون تولیدشده:** `waybill_year_key INT GENERATED ALWAYS AS (COALESCE(waybill_year,0)) STORED`

**ایندکس‌های عملکرد:** `waybills (organization_id, shipment_status)` · `(organization_id, waybill_number)` · `(driver_id)` · `(created_at)` · `payments (waybill_id)` · `(organization_id, status)` · `documents (sha256_hash)` · `(waybill_id)` · `notification_jobs (status, delivery_status)` · `notifications (user_id, is_read)` · `gateway_transactions (status, expires_at)` · `bank_cards (organization_id, is_active, display_order)` · `audit_logs (organization_id, entity_type, entity_id)` · `(created_at)`

## ۵. مهاجرت (فصل ۹.۹)

- `prisma migrate` نسخه‌دار forward-only؛ SQL دستی روی تولید ممنوع.
- الگوی expand-contract برای تغییرهای مخرب؛ backfill جدا و idempotent.
- ایندکس جدید روی جداول زنده: `CREATE INDEX CONCURRENTLY`؛ CHECK جدید: `NOT VALID` → `VALIDATE`.
- snapshot پیش از مهاجرت جداول مالی (payments/refunds/amounts/audit).
- تست مهاجرت روی restore بکاپ واقعی؛ drift-check (`prisma migrate diff`) در CI در هر PR.

## مثال قبول/رد

- ✅ ثبت دو بازگشت وجه هم‌زمان روی یک بارنامه → فقط اولی از سقف عبور نمی‌کند (advisory lock)
- ✅ رکورد فرزند با `organization_id` ناسازگار با بارنامه → رد توسط FK مرکب
- ❌ `UPDATE waybills SET waybill_number='...'` → خطای `WAYBILL_IDENTITY_IMMUTABLE`
- ❌ INSERT سطری با `release_status='RELEASED'` و `payment_status='SUBMITTED'` → رد توسط CHECK


---

## مستندات مرتبط

- [گذار وضعیت‌ها](state-transitions.md) و [ناورداها](invariants.md)
- [AGENTS.md پرابی](../../prisma/AGENTS.md) — قواعد اسکیما/مهاجرت
- [سند مادر v2.5](../master-spec/barnameh-pay-master-doc-2.5.md) — فصل ۷ (مدل داده + قیدهای ۷.۴)
- [معماری کلی](overview.md)
