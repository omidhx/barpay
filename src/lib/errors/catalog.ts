/**
 * Unified System Error Catalog for barnameh-pay.
 * Follows api-contracts.md, business-rules.md, and master-spec §16.7.
 * 
 * Every error has a stable code, a clear Persian user-facing message,
 * an optional action hint, and a retryable flag.
 */

export interface ErrorDefinition {
  code: string;
  humanMessage: string;
  actionHint?: string;
  retryable: boolean;
  httpStatus: number;
}

export const ERROR_CATALOG: Record<string, ErrorDefinition> = {
  // Commitment & Driver Gate
  COMMITMENT_NOT_ACCEPTED: {
    code: "COMMITMENT_NOT_ACCEPTED",
    humanMessage: "پذیرش تعهدنامه پیش از اقدام به پرداخت الزامی است.",
    actionHint: "ابتدا متن تعهدنامه را مطالعه و تأیید کنید.",
    retryable: false,
    httpStatus: 422,
  },
  COMMITMENT_DECLINED: {
    code: "COMMITMENT_DECLINED",
    humanMessage: "تعهدنامه توسط راننده رد شد.",
    actionHint: "برای پیگیری موضوع با پشتیبانی شرکت تماس حاصل فرمایید.",
    retryable: false,
    httpStatus: 400,
  },
  COMMITMENT_NO_ACTIVE_VERSION: {
    code: "COMMITMENT_NO_ACTIVE_VERSION",
    humanMessage: "هیچ نسخه فعالی از تعهدنامه در سیستم تعریف نشده است.",
    actionHint: "با مدیر سیستم جهت فعال‌سازی قالب تعهدنامه تماس بگیرید.",
    retryable: false,
    httpStatus: 500,
  },
  TEMPLATE_VARIABLE_UNRESOLVED: {
    code: "TEMPLATE_VARIABLE_UNRESOLVED",
    humanMessage: "برخی متغیرهای قالب تعهدنامه قابل مقداردهی نیستند.",
    actionHint: "اطلاعات بارنامه و راننده را بازبینی کنید.",
    retryable: false,
    httpStatus: 422,
  },

  // Payments & Concurrency
  PAYMENT_STATE_CONFLICT: {
    code: "PAYMENT_STATE_CONFLICT",
    humanMessage: "وضعیت این پرداخت توسط متصدی دیگری تغییر یافته است.",
    actionHint: "صفحه را تازه‌سازی کنید تا آخرین وضعیت را مشاهده نمایید.",
    retryable: false,
    httpStatus: 409,
  },
  PAYMENT_ALREADY_REVIEWED: {
    code: "PAYMENT_ALREADY_REVIEWED",
    humanMessage: "این پرداخت قبلاً بررسی و تعیین وضعیت شده است.",
    actionHint: "نیازی به اقدام مجدد نیست.",
    retryable: false,
    httpStatus: 409,
  },
  OVERPAYMENT_REQUIRES_DISCREPANCY: {
    code: "OVERPAYMENT_REQUIRES_DISCREPANCY",
    humanMessage: "مبلغ واریزی بیش از مانده بارنامه است و باید در صف مغایرت بررسی شود.",
    actionHint: "پرداخت را به عنوان مغایرت ثبت کنید.",
    retryable: false,
    httpStatus: 422,
  },
  AMOUNT_CHANGED: {
    code: "AMOUNT_CHANGED",
    humanMessage: "مبلغ بارنامه پس از ثبت این تلاش پرداخت اصلاح شده است.",
    actionHint: "تلاش پرداخت جدید با مبلغ به‌روز ایجاد فرمایید.",
    retryable: false,
    httpStatus: 409,
  },
  PAYMENT_TRACKING_DUPLICATE: {
    code: "PAYMENT_TRACKING_DUPLICATE",
    humanMessage: "شماره پیگیری واریز قبلاً در سیستم ثبت شده است.",
    actionHint: "شماره تراکنش واردشده را بررسی نمایید.",
    retryable: false,
    httpStatus: 409,
  },

  // Gateway
  GATEWAY_AMOUNT_MISMATCH: {
    code: "GATEWAY_AMOUNT_MISMATCH",
    humanMessage: "مبلغ تأییدشده درگاه با مبلغ ثبت‌شده بارنامه مطابقت ندارد.",
    actionHint: "تراکنش به عنوان ناموفق علامت‌گذاری شد. با پشتیبانی تماس بگیرید.",
    retryable: false,
    httpStatus: 400,
  },
  GATEWAY_CALLBACK_INVALID: {
    code: "GATEWAY_CALLBACK_INVALID",
    humanMessage: "اطلاعات بازگشتی درگاه پرداخت معتبر نیست.",
    actionHint: "تراکنش قابل تأیید نمی‌باشد.",
    retryable: false,
    httpStatus: 400,
  },
  GATEWAY_REFERENCE_DUPLICATE: {
    code: "GATEWAY_REFERENCE_DUPLICATE",
    humanMessage: "شناسه مرجع درگاه قبلاً در سیستم استفاده شده است.",
    actionHint: "از تکرار بازگشت تراکنش جلوگیری شد.",
    retryable: false,
    httpStatus: 409,
  },
  GATEWAY_ATTEMPT_LOCKED: {
    code: "GATEWAY_ATTEMPT_LOCKED",
    humanMessage: "یک تلاش پرداخت فعال برای این بارنامه در جریان است.",
    actionHint: "لطفاً تا اتمام زمان یا استعلام نتیجه صبور باشید.",
    retryable: false,
    httpStatus: 409,
  },

  // Refunds & Maker-Checker
  REFUND_MAKER_CHECKER_VIOLATION: {
    code: "REFUND_MAKER_CHECKER_VIOLATION",
    humanMessage: "کاربر ثبت‌کننده بازگشت وجه نمی‌تواند آن را تأیید نماید (اصل تفکیک ثبت‌کننده و تأییدکننده).",
    actionHint: "تأیید باید توسط کاربر دیگری با دسترسی سرپرست انجام شود.",
    retryable: false,
    httpStatus: 403,
  },
  REFUND_CEILING_EXCEEDED: {
    code: "REFUND_CEILING_EXCEEDED",
    humanMessage: "مجموع مبلغ بازگشت وجه نمی‌تواند از مجموع پرداخت‌های تأییدشده بارنامه فراتر رود.",
    actionHint: "مبلغ بازگشتی را با سقف پرداخت‌های تأییدشده تطبیق دهید.",
    retryable: false,
    httpStatus: 422,
  },
  REFUND_ALREADY_SETTLED: {
    code: "REFUND_ALREADY_SETTLED",
    humanMessage: "این رکورد بازگشت وجه قبلاً تأیید، رد یا تسویه شده است.",
    actionHint: "وضعیت رکورد بازگشت وجه را در سیستم بررسی نمایید.",
    retryable: false,
    httpStatus: 409,
  },
  REJECTION_REASON_REQUIRED: {
    code: "REJECTION_REASON_REQUIRED",
    humanMessage: "درج دلیل برای رد پرداخت یا رد بازگشت وجه الزامی است.",
    actionHint: "دلیل مشخصی برای عدم پذیرش وارد نمایید.",
    retryable: false,
    httpStatus: 400,
  },
  AMOUNT_CORRECTION_REASON_REQUIRED: {
    code: "AMOUNT_CORRECTION_REASON_REQUIRED",
    humanMessage: "درج دلیل برای اصلاح مبلغ بارنامه الزامی است.",
    actionHint: "علت تغییر مبلغ را به طور شفاف ثبت فرمایید.",
    retryable: false,
    httpStatus: 400,
  },

  // Documents & Release
  DOCUMENT_NOT_VERIFIED: {
    code: "DOCUMENT_NOT_VERIFIED",
    humanMessage: "فایل بارنامه هنوز متصل یا تأیید نشده است.",
    actionHint: "ابتدا باید سند PDF توسط متصدی متصل و تأیید گردد.",
    retryable: false,
    httpStatus: 403,
  },
  PAYMENT_NOT_SETTLED: {
    code: "PAYMENT_NOT_SETTLED",
    humanMessage: "مبلغ بارنامه هنوز به صورت کامل تسویه و تأیید نشده است.",
    actionHint: "پس از تأیید پرداخت امکان دریافت فایل وجود خواهد داشت.",
    retryable: false,
    httpStatus: 403,
  },
  RELEASE_NOT_AUTHORIZED: {
    code: "RELEASE_NOT_AUTHORIZED",
    humanMessage: "مجوز آزادسازی بارنامه صادر نشده است.",
    actionHint: "با مسئول عملیات جهت صدور مجوز هماهنگ کنید.",
    retryable: false,
    httpStatus: 403,
  },
  WAYBILL_NOT_ACTIVE: {
    code: "WAYBILL_NOT_ACTIVE",
    humanMessage: "بارنامه در وضعیت فعال قرار ندارد (باطل یا بایگانی شده است).",
    actionHint: "انجام عملیات روی این پرونده مجاز نیست.",
    retryable: false,
    httpStatus: 400,
  },

  // Idempotency & Auth
  IDEMPOTENCY_KEY_REUSED: {
    code: "IDEMPOTENCY_KEY_REUSED",
    humanMessage: "کلید یکتایی با بدنه درخواست متفاوت ارسال شده است.",
    actionHint: "برای درخواست جدید از کلید Idempotency جدید استفاده نمایید.",
    retryable: false,
    httpStatus: 409,
  },
  UNAUTHORIZED: {
    code: "UNAUTHORIZED",
    humanMessage: "احراز هویت انجام نشده است یا نشست منقضی شده است.",
    actionHint: "مجدداً وارد سامانه شوید.",
    retryable: false,
    httpStatus: 401,
  },
  FORBIDDEN: {
    code: "FORBIDDEN",
    humanMessage: "شما مجوز انجام این عملیات را ندارید.",
    actionHint: "با سرپرست شرکت جهت دریافت دسترسی هماهنگ فرمایید.",
    retryable: false,
    httpStatus: 403,
  },
  NOT_FOUND: {
    code: "NOT_FOUND",
    humanMessage: "مورد درخواستی در سامانه یافت نشد.",
    actionHint: "شناسه ارسالی را مجدداً بررسی نمایید.",
    retryable: false,
    httpStatus: 404,
  },
  INTERNAL_ERROR: {
    code: "INTERNAL_ERROR",
    humanMessage: "خطای پیش‌بینی‌نشده در سرور رخ داده است.",
    actionHint: "با پشتیبانی سامانه تماس حاصل فرمایید.",
    retryable: true,
    httpStatus: 500,
  },
};

export function getErrorResponse(code: string, correlationId?: string) {
  const err = ERROR_CATALOG[code] || {
    code,
    humanMessage: "خطای نامشخص در سامانه رخ داده است.",
    retryable: false,
    httpStatus: 500,
  };

  return {
    ok: false,
    data: null,
    error: {
      code: err.code,
      humanMessage: err.humanMessage,
      actionHint: err.actionHint,
      retryable: err.retryable,
      correlationId: correlationId || crypto.randomUUID().slice(0, 8),
    },
  };
}
