import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { AppError } from "@/lib/errors/exceptions";
import { decryptCredentials } from "@/lib/crypto/encryption";
import {
  GatewayProviderCode,
  getGatewayAdapter,
} from "./adapters";
import { submitWaybillPayment } from "@/modules/waybills/state-machine";

export interface InitiateGatewayPaymentInput {
  organizationId: string;
  waybillId: string;
  callbackBaseUrl: string;
  linkToken?: string;
  clientIp?: string;
  userAgent?: string;
}

export interface InitiateGatewayPaymentResult {
  transactionId: string;
  state: string;
  provider: GatewayProviderCode;
  redirect: {
    method: "GET" | "POST";
    url: string;
    formFields?: Record<string, string>;
  };
}

/**
 * Initiates an online gateway payment attempt.
 * Enforces:
 * - Commitment signed (in ENFORCED mode)
 * - Single open gateway transaction per waybill (20-minute expiry)
 * - Amount strictly sourced from waybill_amounts
 * - Credentials decrypted on-the-fly (AES-256-GCM)
 */
export async function initiateGatewayPayment(
  input: InitiateGatewayPaymentInput
): Promise<InitiateGatewayPaymentResult> {
  const { organizationId, waybillId, callbackBaseUrl, linkToken } = input;

  const waybill = await prisma.waybill.findFirst({
    where: { id: waybillId, organizationId },
    include: {
      amounts: { where: { isCurrent: true }, take: 1 },
      organization: { include: { settings: true } },
    },
  });

  if (!waybill) {
    throw new AppError("NOT_FOUND", "بارنامه مورد نظر یافت نشد.");
  }

  if (waybill.shipmentStatus === "CANCELLED" || waybill.shipmentStatus === "ARCHIVED") {
    throw new AppError("WAYBILL_NOT_ACTIVE", "امکان پرداخت برای بارنامه باطل یا بایگانی‌شده وجود ندارد.");
  }

  // Check commitment in ENFORCED mode
  const enforcement =
    waybill.organization?.settings?.commitmentEnforcement ??
    (process.env.COMMITMENT_ENFORCEMENT as "OFF" | "SHADOW" | "ENFORCED") ??
    "OFF";

  if (enforcement === "ENFORCED" && waybill.commitmentStatus !== "ACCEPTED") {
    throw new AppError(
      "COMMITMENT_NOT_ACCEPTED",
      "پیش از شروع پرداخت، تأیید و امضای تعهدنامه توسط راننده الزامی است."
    );
  }

  const currentAmount = waybill.amounts[0];
  if (!currentAmount) {
    throw new AppError("INTERNAL_ERROR", "مبلغ فعال برای بارنامه یافت نشد.");
  }

  const now = new Date();

  // Invariant 9: gateway_transactions (waybill_id) WHERE status IN ('INITIATED','RETURNED','UNKNOWN')
  // Check for existing open transactions
  const existingOpenTx = await prisma.gatewayTransaction.findFirst({
    where: {
      waybillId,
      status: { in: ["INITIATED", "RETURNED", "UNKNOWN"] },
    },
  });

  if (existingOpenTx) {
    // If older than 20 minutes or expired, mark it EXPIRED so a fresh attempt can proceed
    const isExpired = existingOpenTx.expiresAt && existingOpenTx.expiresAt <= now;
    const isOld = existingOpenTx.createdAt.getTime() + 20 * 60 * 1000 <= now.getTime();

    if (isExpired || isOld) {
      await prisma.gatewayTransaction.update({
        where: { id: existingOpenTx.id },
        data: { status: "EXPIRED" },
      });
    } else {
      throw new AppError(
        "GATEWAY_ATTEMPT_LOCKED",
        "یک تلاش پرداخت فعال برای این بارنامه در جریان است. لطفاً تا اتمام زمان یا استعلام نتیجه صبور باشید."
      );
    }
  }

  // Find active gateway for organization
  const gateway = await prisma.paymentGateway.findFirst({
    where: { organizationId, isActive: true },
  });

  if (!gateway) {
    throw new AppError(
      "INTERNAL_ERROR",
      "هیچ درگاه پرداخت فعالی برای شرکت تعریف یا فعال نشده است. لطفاً با پشتیبانی تماس بگیرید."
    );
  }

  // Decrypt credentials
  const credentials = decryptCredentials(gateway.credentialsJson);
  const state = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000); // 20 minutes attempt TTL

  // Create GatewayTransaction record in INITIATED state
  const transaction = await prisma.gatewayTransaction.create({
    data: {
      organizationId,
      waybillId,
      paymentGatewayId: gateway.id,
      provider: gateway.provider,
      state,
      amount: currentAmount.amount,
      waybillAmountId: currentAmount.id,
      status: "INITIATED",
      expiresAt,
    },
  });

  const adapter = getGatewayAdapter(gateway.provider as GatewayProviderCode);
  const tokenParam = linkToken ? `&token=${encodeURIComponent(linkToken)}` : "";
  const callbackUrl = `${callbackBaseUrl}/api/payments/gateway/callback/${gateway.provider.toLowerCase()}?state=${state}${tokenParam}`;

  try {
    const initResult = await adapter.initiatePayment({
      amountRial: currentAmount.amount,
      waybillNumber: waybill.waybillNumber,
      driverMobile: waybill.driverMobileRaw,
      callbackUrl,
      state,
      credentials,
      sandbox: gateway.mode === "SANDBOX",
    });

    // Update with providerReference and init payload
    await prisma.gatewayTransaction.update({
      where: { id: transaction.id },
      data: {
        providerReference: initResult.providerReference,
        initPayloadJson: (initResult.raw || {}) as Prisma.InputJsonValue,
      },
    });

    return {
      transactionId: transaction.id,
      state,
      provider: gateway.provider as GatewayProviderCode,
      redirect: initResult.redirect,
    };
  } catch (err) {
    await prisma.gatewayTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "FAILED",
        errorCode: "GATEWAY_INIT_FAILED",
      },
    });
    throw err;
  }
}

export interface HandleGatewayCallbackInput {
  provider: GatewayProviderCode;
  state?: string;
  providerReference?: string;
  queryParams: Record<string, string>;
  bodyParams?: Record<string, unknown>;
  clientIp?: string;
  userAgent?: string;
}

export interface HandleGatewayCallbackResult {
  status: "VERIFIED" | "FAILED" | "UNKNOWN" | "ALREADY_VERIFIED";
  waybillId: string;
  amount: bigint;
  message?: string;
  referenceNumber?: string;
}

/**
 * Handles incoming gateway callback:
 * - Server-to-server verification ONLY (never trusts callback params)
 * - Rial amount mismatch check
 * - Idempotency for duplicate callbacks
 * - Transactional creation of approved Payment
 */
export async function handleGatewayCallback(
  input: HandleGatewayCallbackInput
): Promise<HandleGatewayCallbackResult> {
  const { provider, state, providerReference, queryParams, bodyParams = {}, clientIp, userAgent } =
    input;

  // Locate transaction by state or providerReference
  const transaction = await prisma.gatewayTransaction.findFirst({
    where: {
      provider,
      OR: [
        state ? { state } : {},
        providerReference ? { providerReference } : {},
      ].filter((cond) => Object.keys(cond).length > 0),
    },
    include: {
      gateway: true,
    },
  });

  if (!transaction) {
    throw new AppError("GATEWAY_CALLBACK_INVALID", "اطلاعات بازگشتی درگاه پرداخت معتبر نیست.");
  }

  // Idempotency: if already verified, return idempotent success
  if (transaction.status === "VERIFIED") {
    return {
      status: "ALREADY_VERIFIED",
      waybillId: transaction.waybillId,
      amount: transaction.amount,
      referenceNumber: transaction.providerReference ?? undefined,
    };
  }

  const callbackPayload = { ...queryParams, ...bodyParams };

  // Update status to RETURNED and store callback payload
  await prisma.gatewayTransaction.update({
    where: { id: transaction.id },
    data: {
      status: "RETURNED",
      callbackPayloadJson: callbackPayload as Prisma.InputJsonValue,
    },
  });

  const credentials = decryptCredentials(transaction.gateway.credentialsJson);
  const adapter = getGatewayAdapter(provider);

  let verifyResult;
  try {
    verifyResult = await adapter.verifyTransaction({
      providerReference: transaction.providerReference || transaction.state,
      amountRial: transaction.amount,
      callbackPayload,
      credentials,
      sandbox: transaction.gateway.mode === "SANDBOX",
    });
  } catch {
    // Network / timeout during verify -> UNKNOWN state (job will poll)
    await prisma.gatewayTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "UNKNOWN",
        errorCode: "VERIFY_NETWORK_ERROR",
      },
    });

    return {
      status: "UNKNOWN",
      waybillId: transaction.waybillId,
      amount: transaction.amount,
      message: "نتیجه تراکنش از درگاه استعلام نشد. بررسی خودکار انجام خواهد شد.",
    };
  }

  // Amount mismatch check
  if (verifyResult.paidAmountRial !== undefined && verifyResult.paidAmountRial !== transaction.amount) {
    await prisma.gatewayTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "FAILED",
        errorCode: "GATEWAY_AMOUNT_MISMATCH",
        verifyPayloadJson: (verifyResult.raw || {}) as Prisma.InputJsonValue,
      },
    });

    throw new AppError(
      "GATEWAY_AMOUNT_MISMATCH",
      "مبلغ تأییدشده توسط درگاه با مبلغ بارنامه مطابقت ندارد. تراکنش ناموفق اعلام شد."
    );
  }

  if (!verifyResult.verified) {
    await prisma.gatewayTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "FAILED",
        errorCode: "GATEWAY_VERIFY_FAILED",
        verifyPayloadJson: (verifyResult.raw || {}) as Prisma.InputJsonValue,
      },
    });

    return {
      status: "FAILED",
      waybillId: transaction.waybillId,
      amount: transaction.amount,
      message: "تراکنش توسط درگاه بانکی تأیید نگردید.",
    };
  }

  // Verified successfully: Atomic DB update + state machine payment submission
  await prisma.$transaction(async (tx) => {
    // 1. Update transaction
    await tx.gatewayTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "VERIFIED",
        verifyPayloadJson: (verifyResult.raw || {}) as Prisma.InputJsonValue,
      },
    });

    // 2. Submit payment using state machine
    await submitWaybillPayment({
      organizationId: transaction.organizationId,
      waybillId: transaction.waybillId,
      method: "GATEWAY",
      amount: transaction.amount,
      trackingNumber:
        verifyResult.traceNumber ||
        verifyResult.referenceNumber ||
        transaction.providerReference ||
        undefined,
      gatewayProvider: transaction.provider,
      gatewayTransactionId: transaction.id,
      actor: {
        actorType: "DRIVER",
        actorId: "GATEWAY_AUTO",
        ip: clientIp,
        userAgent,
      },
    });
  });

  return {
    status: "VERIFIED",
    waybillId: transaction.waybillId,
    amount: transaction.amount,
    referenceNumber:
      verifyResult.referenceNumber ||
      verifyResult.traceNumber ||
      transaction.providerReference ||
      undefined,
  };
}

/**
 * Periodically inquires UNKNOWN transactions (every 10m up to 24h).
 */
export async function inquireUnknownTransactions(): Promise<{
  checked: number;
  resolved: number;
}> {
  const past24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const unknownTxs = await prisma.gatewayTransaction.findMany({
    where: {
      status: "UNKNOWN",
      createdAt: { gte: past24h },
    },
    include: { gateway: true },
    take: 50,
  });

  let resolved = 0;

  for (const tx of unknownTxs) {
    try {
      const credentials = decryptCredentials(tx.gateway.credentialsJson);
      const adapter = getGatewayAdapter(tx.provider as GatewayProviderCode);
      const inquiryRes = await adapter.inquiryTransaction({
        providerReference: tx.providerReference || tx.state,
        credentials,
        sandbox: tx.gateway.mode === "SANDBOX",
      });

      if (inquiryRes.status === "VERIFIED") {
        await prisma.gatewayTransaction.update({
          where: { id: tx.id },
          data: {
            status: "VERIFIED",
            verifyPayloadJson: (inquiryRes.raw || {}) as Prisma.InputJsonValue,
          },
        });

        await submitWaybillPayment({
          organizationId: tx.organizationId,
          waybillId: tx.waybillId,
          method: "GATEWAY",
          amount: tx.amount,
          trackingNumber: inquiryRes.traceNumber || tx.providerReference || undefined,
          gatewayProvider: tx.provider,
          gatewayTransactionId: tx.id,
          actor: {
            actorType: "SYSTEM",
            actorId: "INQUIRY_WORKER",
          },
        });

        resolved++;
      } else if (inquiryRes.status === "FAILED") {
        await prisma.gatewayTransaction.update({
          where: { id: tx.id },
          data: { status: "FAILED", errorCode: "INQUIRY_CONFIRMED_FAILED" },
        });
        resolved++;
      }
    } catch {
      // Continue next iteration
    }
  }

  return { checked: unknownTxs.length, resolved };
}

/**
 * Tests gateway connectivity from the panel before activating.
 */
export async function testGatewayConnection(
  organizationId: string,
  gatewayId: string
): Promise<{ success: boolean; message: string; latencyMs: number }> {
  const gateway = await prisma.paymentGateway.findFirst({
    where: { id: gatewayId, organizationId },
  });

  if (!gateway) {
    throw new AppError("NOT_FOUND", "درگاه پرداخت مورد نظر یافت نشد.");
  }

  const credentials = decryptCredentials(gateway.credentialsJson);
  const adapter = getGatewayAdapter(gateway.provider as GatewayProviderCode);

  const startTime = Date.now();
  try {
    // Attempt inquiry with dummy reference to test credentials and network connectivity
    await adapter.inquiryTransaction({
      providerReference: "HEALTH_CHECK_TEST",
      credentials,
      sandbox: gateway.mode === "SANDBOX",
    });

    const latencyMs = Date.now() - startTime;

    await prisma.paymentGateway.update({
      where: { id: gateway.id },
      data: {
        lastHealthCheckAt: new Date(),
        lastHealthStatus: "OK",
      },
    });

    return {
      success: true,
      message: "اتصال به سرور درگاه با موفقیت برقرار شد.",
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);

    await prisma.paymentGateway.update({
      where: { id: gateway.id },
      data: {
        lastHealthCheckAt: new Date(),
        lastHealthStatus: `ERROR: ${msg.slice(0, 100)}`,
      },
    });

    return {
      success: false,
      message: `برقراری ارتباط با درگاه با خطا مواجه شد: ${msg}`,
      latencyMs,
    };
  }
}
