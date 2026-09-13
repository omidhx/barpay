# ماژول ممیزی (Audit Module)

این ماژول مسئول ثبت تغییرات حساس، ایجاد ردپای غیرقابل دستکاری (Immutable Audit Trail) با زنجیره هش `prev_hash` و `row_hash` و ارسال رویدادها به پایگاه داده است.

## مرزهای ماژول
- جدول اصلی: `audit_logs` (فقط INSERT و SELECT برای نقش برنامه).
- وابستگی‌ها: مستقل.
- نقاط خروجی: ثبت رویداد ممیزی با actor, action, entity, before/after snapshot.
