# ماژول تحویل و آزادسازی بارنامه (Delivery Module)

این ماژول مسئول اجرای قاعده مرکزی `canRelease`، صدور مجوز آزادسازی (`release_authorizations`) و اعطای گرنت اتمیک دانلود به همراه ثبت در `document_access_events` است.

## مرزهای ماژول
- جداول: `release_authorizations`, `document_access_events`.
- شروط ناوردای آزادسازی: PDF تاییدشده + پرداخت کامل تاییدشده + تعهدنامه تاییدشده + بارنامه فعال + نشست معتبر.
