# ران‌بوک — استقرار (deploy)

> **منبع:** سند مادر v2.5 فصل ۹ (۹.۲/۹.۷/۹.۹) و ۱۴.

## پیش‌شرط‌ها

- [ ] CI سبز: lint + typecheck + unit + integration (PG واقعی) + drift-check + ماتریس دسترسی
- [ ] migration جدید روی restore بکاپ واقعی در CI اجرا و verify شده
- [ ] `.env` سرور مقصد کامل (DB_URL، کلید AES درگاه، اعتبارنامهٔ پیامک، …)
- [ ] عکس snapshot در صورت مهاجرت جداول مالی

## استقرار/به‌روزرسانی یک سازمان

```bash
# ۱. ایمیج جدید
docker build -t barnameh-pay:SHA .
# ۲. اجرای مهاجرت‌ها (نسخه‌دار، forward-only)
./tools/migrate-all.ts --org <org>          # گزارش نسخهٔ schema
# ۳. جایگزینی سرویس‌ها (web + worker از یک ایمیج)
docker compose -f docker-compose.prod.yml up -d
# ۴. health-check
curl -f https://<org-domain>/api/health
```

- **انتشار ترتیبی چند-استقرار:** سازمان به سازمان؛ شکست health-check → همان سازمان hold می‌شود و سازمان‌های بعدی اجرا نمی‌شوند.
- هر استقرار: نسخهٔ image + نسخهٔ schema + نتیجه در registry استقرارها ثبت می‌شود.

## rollback کد

بازگشت به image قبلی Docker (داده هرگز با git revert روی schema برنمی‌گردد — بند rollback.md).

## سرویس‌ها

- `web`: Next.js (SSR پورتال راننده) پشت Nginx (TLS، rate limit عمومی per-IP، `X-Accel-Redirect` برای دانلود).
- `worker`: graphile-worker (پیامک، استعلام UNKNOWN، پاک‌سازی، زمان‌بندی‌ها) — استقرار/ری‌استارت وب آن را قطع نمی‌کند.
- `db`: PostgreSQL 16 + WAL archiving (RPO ≤۱۵ دقیقه).
- ذخیرهٔ فایل: object storage خصوصی (S3 سازگار)؛ آرشیو بکاپ off-site.

## پس از استقرار (دود-تست حداقلی)

- [ ] ورود پنل + یک جست‌وجوی بارنامه
- [ ] صفحهٔ اول لینک راننده (نمایش نام شرکت بدون دادهٔ حساس)
- [ ] `/api/health` سبز
- [ ] عمق صف پیامک صفر/طبیعی
- [ ] ثبت رویداد استقرار در audit


---

## مستندات مرتبط

- [بازگشت از انتشار ناموفق](rollback.md) · [بکاپ و بازیابی](backup-restore.md) · [استقرار مشتری جدید](onboard-new-customer.md)
- [معماری کلی](../architecture/overview.md) — توپولوژی سرویس‌ها
- [TODO.md](../../TODO.md) — فاز ۲ و ۷
