# ران‌بوک — بازگشت از انتشار ناموفق (rollback)

> **منبع:** سند مادر v2.5 فصل ۹.۹. قاعدهٔ طلایی: **rollback کد ≠ rollback داده.**

## سناریو ۱ — انتشار کد معیوب (دیتابیس سازگار)

```bash
docker tag barnameh-pay:<آخرین-image-سالم> barnameh-pay:current
docker compose -f docker-compose.prod.yml up -d
curl -f https://<org-domain>/api/health
```

- کد rollback می‌شود؛ داده دست نمی‌خورد؛ رویداد در audit ثبت می‌شود.
- انتشار روی همان سازمان hold می‌ماند تا ریشه‌یابی؛ سازمان‌های بعدی اجرا نمی‌شوند.

## سناریو ۲ — مهاجرت معیوب (schema/data)

- **هرگز** `git revert` روی migration یا SQL دستی اصلاحی روی تولید اجرا نکنید.
- مسیر صحیح: restore از snapshot پیش‌مهاجرت (طبق backup-restore.md) یا مهاجرت اصلاحی forward-only جدید + backfill idempotent.
- علت snapshot جداول مالی (payments/refunds/amounts/audit) پیش از هر مهاجرت: پنجرهٔ ریسک نباید از ۱۵ دقیقه به یک شیفت کاری گسترش یابد.

## سناریو ۳ — رفتار منطقی غلط (بدون خطای فنی)

1. feature flag مربوطه خاموش شود (فقط `COMMITMENT_ENFORCEMENT` و `SIGNED_URL_DOWNLOAD` موجودند).
2. اگر flag کافی نبود: rollback کد (سناریو ۱) + ثبت issue با ریشه‌یابی.
3. تصمیم «اصلاح مستقیم داده» فقط با مجوز صریح و audit — دادهٔ مالی هرگز با ویرایش خاموش تغییر نمی‌کند.

## نکات

- مهاجرت‌ها forward-only و نسخه‌دارند؛ الگوی expand-contract یعنی کد جدید با schema قدیم سازگار است (ستون قدیمی تا گام contract حذف نمی‌شود).
- هر rollback در `audit_logs` + گزارش incident ثبت می‌شود.


---

## مستندات مرتبط

- [استقرار](deploy.md) · [بکاپ و بازیابی](backup-restore.md) · [واکنش به حادثه](incident-response.md)
- [AGENTS.md پرابی](../../prisma/AGENTS.md) — چرا revert روی migration ممنوع است
