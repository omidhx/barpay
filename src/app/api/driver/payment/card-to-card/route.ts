import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import { validateDriverSession } from "@/modules/auth/driver-auth";
import { submitWaybillPayment } from "@/modules/waybills/state-machine";
import { getStorageProvider } from "@/lib/storage";
import { normalizeDigits } from "@/lib/utils/digits";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("driver_session")?.value;

    if (!sessionToken) {
      throw new AppError("UNAUTHORIZED", "نشست راننده نامعتبر است.");
    }

    const session = await validateDriverSession(sessionToken);
    const body = await request.json();

    const { payoutCardId, trackingNumber, receiptImageBase64 } = body;

    if (!payoutCardId) {
      throw new AppError("INVALID_ARGUMENT", "انتخاب کارت بانکی مقصد الزامی است.");
    }

    // Verify the card belongs to the organization and is active
    const card = await prisma.bankCard.findFirst({
      where: { id: payoutCardId, organizationId: session.organizationId, isActive: true },
    });

    if (!card) {
      throw new AppError("NOT_FOUND", "کارت بانکی انتخاب‌شده معتبر یا فعال نیست.");
    }

    const normalizedTracking = trackingNumber
      ? normalizeDigits(trackingNumber).replace(/\D/g, "")
      : "";

    if (!normalizedTracking && !receiptImageBase64) {
      throw new AppError(
        "INVALID_ARGUMENT",
        "ثبت حداقل یکی از موارد شماره پیگیری یا تصویر رسید پرداخت الزامی است."
      );
    }

    if (normalizedTracking && (normalizedTracking.length < 4 || normalizedTracking.length > 20)) {
      throw new AppError(
        "INVALID_ARGUMENT",
        "شماره پیگیری تراکنش باید بین ۴ تا ۲۰ رقم باشد."
      );
    }

    // Fetch waybill amount
    const waybill = await prisma.waybill.findUnique({
      where: { id: session.waybillId },
      include: {
        amounts: { where: { isCurrent: true }, take: 1 },
      },
    });

    if (!waybill || !waybill.amounts[0]) {
      throw new AppError("NOT_FOUND", "بارنامه یا مبلغ فعال آن یافت نشد.");
    }

    let receiptDocumentId: string | undefined;

    // Process receipt image if uploaded
    if (receiptImageBase64) {
      const base64Data = receiptImageBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      if (buffer.length > 5 * 1024 * 1024) {
        throw new AppError("FILE_TOO_LARGE", "حجم تصویر رسید نمی‌تواند بیش از ۵ مگابایت باشد.");
      }

      const sha256Hash = crypto.createHash("sha256").update(buffer).digest("hex");
      const docId = crypto.randomUUID();
      const storageKey = `organizations/${session.organizationId}/waybills/${session.waybillId}/documents/${docId}.jpg`;

      const storageProvider = getStorageProvider();
      await storageProvider.put(storageKey, buffer, "image/jpeg");

      const document = await prisma.document.create({
        data: {
          id: docId,
          organizationId: session.organizationId,
          waybillId: session.waybillId,
          documentType: "PAYMENT_RECEIPT",
          storageKey,
          sha256Hash,
          fileSize: buffer.length,
          mimeType: "image/jpeg",
          visibility: "PRIVATE",
        },
      });

      receiptDocumentId = document.id;
    }

    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    const payment = await submitWaybillPayment({
      organizationId: session.organizationId,
      waybillId: session.waybillId,
      method: "CARD_TO_CARD",
      amount: waybill.amounts[0].amount,
      trackingNumber: normalizedTracking || undefined,
      payoutCardId,
      receiptDocumentId,
      actor: {
        actorType: "DRIVER",
        actorId: session.sessionId,
        ip: clientIp,
        userAgent,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        paymentId: payment.id,
        status: payment.status,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        getErrorResponse(error.code, error.correlationId),
        { status: error.httpStatus }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          humanMessage: error instanceof Error ? error.message : "خطا در ثبت پرداخت کارت‌به‌کارت",
          retryable: false,
        },
      },
      { status: 500 }
    );
  }
}
