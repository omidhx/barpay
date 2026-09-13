import { ERROR_CATALOG } from "./catalog";

export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly humanMessage: string;
  readonly actionHint?: string;
  readonly retryable: boolean;
  readonly correlationId?: string;

  constructor(code: string, customMessage?: string, correlationId?: string) {
    const entry = ERROR_CATALOG[code] || {
      code,
      humanMessage: customMessage || "خطای نامشخص در سامانه رخ داده است.",
      retryable: false,
      httpStatus: 500,
    };

    super(customMessage || entry.humanMessage);
    this.name = "AppError";
    this.code = entry.code;
    this.httpStatus = entry.httpStatus;
    this.humanMessage = customMessage || entry.humanMessage;
    this.actionHint = entry.actionHint;
    this.retryable = entry.retryable;
    this.correlationId = correlationId;
  }
}

export class PaymentStateConflictError extends AppError {
  constructor(currentStatus: string, expectedStatus?: string, correlationId?: string) {
    super(
      "PAYMENT_STATE_CONFLICT",
      `وضعیت این پرداخت قبلاً به «${currentStatus}» تغییر یافته است.${
        expectedStatus ? ` (وضعیت مورد انتظار: ${expectedStatus})` : ""
      }`,
      correlationId
    );
    this.name = "PaymentStateConflictError";
  }
}

export class CommitmentNotAcceptedError extends AppError {
  constructor(correlationId?: string) {
    super("COMMITMENT_NOT_ACCEPTED", undefined, correlationId);
    this.name = "CommitmentNotAcceptedError";
  }
}

export class WaybillNotActiveError extends AppError {
  constructor(currentStatus: string, correlationId?: string) {
    super(
      "WAYBILL_NOT_ACTIVE",
      `بارنامه در وضعیت «${currentStatus}» قرار دارد و فعال نیست.`,
      correlationId
    );
    this.name = "WaybillNotActiveError";
  }
}

export class DocumentNotVerifiedError extends AppError {
  constructor(correlationId?: string) {
    super("DOCUMENT_NOT_VERIFIED", undefined, correlationId);
    this.name = "DocumentNotVerifiedError";
  }
}

export class PaymentNotSettledError extends AppError {
  constructor(correlationId?: string) {
    super("PAYMENT_NOT_SETTLED", undefined, correlationId);
    this.name = "PaymentNotSettledError";
  }
}

export class ReleaseNotAuthorizedError extends AppError {
  constructor(correlationId?: string) {
    super("RELEASE_NOT_AUTHORIZED", undefined, correlationId);
    this.name = "ReleaseNotAuthorizedError";
  }
}
