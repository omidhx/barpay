# یکپارچه‌سازی درگاه‌های پرداخت — payment-gateways

> **منبع:** سند مادر v2.5 پیوست ج. **قاعدهٔ قطعی:** این فایل نقشهٔ شروع است، نه جایگزین
> مطالعهٔ رسمی. جزئیات نهایی هر ارائه‌دهنده در فاز صفر از منبع رسمی تازه خوانده و در
> `docs/integrations/{provider}.md` (حداکثر ۱۵۰ خط + نمونهٔ درخواست/پاسخ) قفل می‌شود.
> اختلاف مستندات همیشه به نفع مستند رسمی حل می‌شود.

## مقایسهٔ ارائه‌دهندگان

| معیار | زرین‌پال | زیبال | سامان SEP | ملت BPM | پاسارگاد | سداد |
|---|---|---|---|---|---|---|
| نوع | واسط | واسط | مستقیم | مستقیم | مستقیم | مستقیم |
| API | REST JSON | REST JSON | REST توکن + صفحه | SOAP WSDL | REST + امضای RSA | REST + AES |
| واحد API | **تومان** | ریال | ریال | ریال | ریال | ریال |
| احراز | merchant_id (UUID) | merchant | terminalId + transactionKey (Basic) | terminalId + user/pass | merchant_id + کلید خصوصی | Key/IV |
| sandbox عمومی | ✅ | ✅ (merchant=zibal) | ترمینال تست | ترمینال تست | طبق مستندات | طبق مستندات |
| قرارداد PSP | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |

فعال‌سازی هر درگاه: مدارک رسمی (ای‌نماد + کد رهگیری مالیاتی طبق مقررات جاری) — artifact فاز صفر.

## رابط واحد آداپتر

```ts
interface PaymentProvider {
  code: 'SEP' | 'BPM' | 'PASARGAD' | 'SADAD' | 'ZARINPAL' | 'ZIBAL'

  initiatePayment(input: {
    amountRial, waybillNumber, driverMobile, callbackUrl
  }): Promise<{ providerReference, redirect: { method: 'GET'|'POST', url, formFields? } }>

  verifyTransaction(input: { providerReference, amountRial }):
    Promise<{ verified, paidAmountRial, maskedPan?, traceNumber?, raw }>

  inquiryTransaction(input: { providerReference }):
    Promise<{ status, paidAmountRial?, raw }>
}
```

قواعد پیاده‌سازی:
- ورودی/خروجی همیشه **ریال**؛ تنها زرین‌پال داخل آداپتر تبدیل می‌کند (ارسال ÷۱۰، مقایسه ×۱۰)؛ هیچ کد دیگری حق تبدیل واحد ندارد.
- timeout ≤۱۰ ثانیه؛ یک retry فقط برای init (idempotent با مرجع)؛ وریفای retry نمی‌شود — نتیجهٔ قطعی یا UNKNOWN.
- کدهای «قبلاً وریفای شده» (زرین‌پال 101، زیبال 101) = موفق idempotent — نه خطا، نه اثر دوم.
- آداپتر **بی‌حالت** است — همهٔ وضعیت‌ها در `gateway_transactions`؛ سه payload کامل (init/callback/verify) ثبت می‌شوند.
- محل کد: `src/modules/payments/gateways/adapters/{provider}.ts` + رجیستری `adapters/index.ts`؛ ارائه‌دهندهٔ هفتم = یک فایل + یک ردیف رجیستری.

## مشخصات هر ارائه‌دهنده (خلاصهٔ اجرایی)

### زرین‌پال (REST v4)
- شروع: `POST payment.zarinpal.com/pg/v4/payment/request.json` `{merchant_id, amount(تومان), callback_url, description, metadata}` → `data.code=100` + `data.authority`
- ریدایرکت: `payment.zarinpal.com/pg/StartPay/{authority}`
- callback: GET با `Authority` و `Status(OK/NOK)` — فقط هدایت
- وریفای: `POST .../verify.json` `{merchant_id, amount, authority}` → `100` موفق / `101` قبلاً وریفای (idempotent) / `data.ref_id` مرجع
- sandbox: دامنهٔ `sandbox.zarinpal.com` در هر دو endpoint
- خطاها: `-50` مغایرت مبلغ، `-51/-52` ناموفق، `-53` انصراف، `-54` یافت نشد... (فهرست کامل از zarinpal.com/docs قفل شود)

### زیبال (REST v1)
- شروع: `POST gateway.zibal.ir/v1/request` `{merchant, amount(ریال ≥۱۰۰۰), callbackUrl, orderId, mobile}` → `trackId`
- ریدایرکت: `gateway.zibal.ir/start/{trackId}`
- وریفای: `POST gateway.zibal.ir/v1/verify` `{merchant, trackId}` → `100` / `101`
- تست: `merchant = "zibal"`
- خطاها: `102/104` merchant، `105` مبلغ کم، `113` مغایرت مبلغ، `202` ناموفق، `203` trackId نامعتبر (فهرست از help.zibal.ir)

### سامان SEP
- احراز: `terminalId` + `transactionKey` → `Authorization: Basic base64(terminalId:transactionKey)`
- توکن: `POST sep.shaparak.ir/api/v1/Payment/GetToken` `{action:"token", terminalId, amount(ریال), resNum, redirectUrl}` → `{status:1, token}`؛ `resNum` = شناسهٔ یکتای ما
- ریدایرکت: POST فرم به `sep.shaparak.ir/OnlinePayments/InitPayment/Pay` با `token`
- callback: POST با `RefNum`, `ResNum`, `State("OK"/خطا)`, `TRACENO`
- وریفای: `POST .../api/v1/Payment/VerifyTxn` `{action:"verify", refNum}` → مقایسهٔ مبلغ (ریال)
- استعلام/برگشت: `CheckTxn` (پایهٔ inquiry) / `RevertTxn` (۱.۱+)
- تست: ترمینال آزمایشی/مبلغ حداقلی + PSP ماک در CI

### ملت BPM (SOAP)
- `bpPayRequest` روی `bpm.shaparak.ir/pgwchannel/services/pgws` — پارامترها: `terminalId, userName, userPassword, orderId(یکتا=state ما), amount(ریال), localDate(YYYYMMDD), localTime(HHMMSS), callBackUrl, payerId=0` → خروجی `"resCode,refId"` (resCode=0 موفق؛ 17=orderId تکراری)
- ریدایرکت: POST فرم به `bpm.shaparak.ir/pgwchannel/startpay.mellat` با `RefNum=refId`
- callback: `RefNum, ResNum, SaleOrderId, SaleReferenceId, ResCode`
- **وریفای دوعاملی:** `bpVerifyRequest` → موفق → `bpSettleRequest` (تسویه)؛ verify موفق + settle خطا → `bpReversalRequest`
- استعلام: `bpInquiryRequest`؛ `SaleReferenceId` در verify_payload نگهداری شود (مرجع برگشت وجه آینده)

### پاسارگاد PEP
- احراز: شناسهٔ فروشگاه + **کلید خصوصی RSA** برای امضای دیجیتال (منبع: pep.co.ir/developers + SDKهای رسمی)
- جریان: درخواست توکن (JSON امضاشده: مبلغ ریال + شمارهٔ سفارش + callback + موبایل) → token → صفحهٔ پرداخت → callback → وریفای server-to-server با همان امضا + مقایسهٔ مبلغ
- کلید خصوصی در `credentials_json` رمزنگاری‌شده (AES-256-GCM)

### سداد
- احراز: `Key/IV` رمزنگاری AES از پنل پذیرنده — بدنهٔ درخواست رمز می‌شود
- جریان: PaymentRequest (بدنهٔ رمزشده: OrderId, Amount ریال, LocalDateTime, ReturnUrl) → Token → صفحهٔ پرداخت → callback (OrderId, ResponseCode) → وریفای Advice/Verify + مقایسهٔ مبلغ

## قواعد امنیتی و صحت (فرآیند ۶.۱۰)

- **عدم اعتماد به callback** — نتیجه فقط از وریفای server-to-server؛ پارامترهای بازگشتی فقط برای هدایت UI و یافتن رکورد تلاش.
- **مقایسهٔ مبلغ** (ریال) — کمتر/بیشتر = `GATEWAY_AMOUNT_MISMATCH` + FAILED.
- **idempotency callback** — تکراری روی VERIFIED = پاسخ موفق بی‌اثر؛ مرجع تکراری = `GATEWAY_REFERENCE_DUPLICATE`.
- **callback جعلی** — state/مرجع نامعتبر = `GATEWAY_CALLBACK_INVALID` + رویداد امنیتی + پاسخ عمومی بی‌جزئیات.
- **UNKNOWN** — هرگز FAILED فرض نمی‌شود؛ job استعلام هر ۱۰ دقیقه تا ۲۴ ساعت؛ راننده «در حال بررسی نتیجه» می‌بیند و دکمهٔ پرداخت مجدد قفل است.
- **انقضا** — تلاش باز >۲۰ دقیقه → EXPIRED (پیش‌فرض قابل تنظیم).
- **تغییر مبلغ حین تلاش** — CANCELLED با `AMOUNT_CHANGED`؛ شروع مجدد با مبلغ جدید.
- **گذار مالی تراکنشی در callback** — وریفای + APPROVED + اعلان‌ها در یک تراکنش DB.
- **اعتبارنامه‌ها** — AES-256-GCM در `payment_gateways.credentials_json` (کلید env)؛ هرگز در لاگ/پاسخ/ریپو؛ PAN ماگسک.
- **SANDBOX** فقط در staging؛ تست اتصال قبل از ACTIVE الزامی (init/verify آزمایشی یا تراکنش حداقلی LIVE).

## راهنمای انتخاب (پیشنهاد پیش‌فرض)

- شروع سریع بدون قرارداد: **واسط (زرین‌پال یا زیبال)** — ثبت‌نام آنلاین؛ مناسب اولین استقرار.
- کارمزد کمتر + واریز مستقیم: **مستقیم** — پس از امضای قرارداد PSP، فقط پیکربندی پنل عوض می‌شود (مهاجرت = یک تراکنش پیکربندی).
- همهٔ ۶ آداپتر از روز اول در کد حضور دارند (هزینهٔ نگهداری پایین، هزینهٔ افزودن دیرهنگام بالا).

## تست آداپترها

- هر ارائه‌دهنده با mock HTTP + پاسخ‌های نمونهٔ رسمی در `tests/fixtures/gateways/`
- سناریوهای الزامی: init/verify/inquiry · نگاشت کدهای خطا · تبدیل ریال↔تومان زرین‌پال (مضرب ۵۰٬۰۰۰ همیشه صحیح تقسیم می‌شود) · `101` = موفق idempotent · مغایرت مبلغ · callback تکراری/جعلی · دو init هم‌زمان · UNKNOWN → استعلام · انقضا · AMOUNT_CHANGED وسط تلاش


---

## مستندات مرتبط

- [ارائه‌دهندگان پیامک](sms-providers.md) — الگوی یکپارچه‌سازی مشابه
- [قراردادهای API](../architecture/api-contracts.md) — endpointهای پرداخت
- [مدل تهدید](../security/threat-model.md) — امنیت callback و اعتبارنامه‌ها
- [سند مادر v2.5](../master-spec/barnameh-pay-master-doc-2.5.md) — فصل ۶.۱۰ + پیوست ج (مشخصات ۶ درگاه)
- [AGENTS.md ورکر](../../workers/AGENTS.md) — job استعلام UNKNOWN
