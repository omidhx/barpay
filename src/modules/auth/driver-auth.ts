import crypto from "crypto";
import { prisma } from "@/lib/db/client";
import { AppError } from "@/lib/errors/exceptions";
import { normalizeDigits, maskMobile } from "@/lib/utils/digits";
import { sendNotificationSms } from "@/modules/notifications/notification-service";

const HMAC_SECRET =
  process.env.APP_SECRET ||
  process.env.GATEWAY_CREDENTIALS_KEY ||
  "barnameh-pay-default-secret-key-32-bytes-minimum";

function computeHmacSha256(value: string): string {
  return crypto.createHmac("sha256", HMAC_SECRET).update(value).digest("hex");
}

export interface CreateDriverAccessLinkInput {
  organizationId: string;
  waybillId: string;
  expiresInHours?: number; // default: 48
  isSingleUse?: boolean;
}

export interface CreateDriverAccessLinkResult {
  linkId: string;
  token: string;
  url: string;
  expiresAt: Date;
}

/**
 * Generates a short-lived link with CSPRNG token (>=128 bits entropy).
 * Only the HMAC-SHA256 hash is persisted (business-rules.md §3 & master-spec §6.3).
 */
export async function createDriverAccessLink(
  input: CreateDriverAccessLinkInput
): Promise<CreateDriverAccessLinkResult> {
  const { organizationId, waybillId, expiresInHours = 48, isSingleUse = false } = input;

  // 1. Generate 32-byte (256-bit) cryptographically secure random token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = computeHmacSha256(rawToken);

  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const link = await prisma.driverAccessLink.create({
    data: {
      organizationId,
      waybillId,
      tokenHash,
      expiresAt,
      isSingleUse,
    },
  });

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const url = `${appUrl}/driver/${rawToken}`;

  return {
    linkId: link.id,
    token: rawToken,
    url,
    expiresAt,
  };
}

export interface VerifyDriverAccessLinkResult {
  linkId: string;
  organizationId: string;
  organizationName: string;
  waybillId: string;
  waybillNumber: string;
  driverName: string;
  maskedMobile: string;
  expiresAt: Date;
}

/**
 * Validates a driver access token against its stored HMAC-SHA256 hash.
 * Returns public metadata only (NO sensitive financial information prior to OTP verification).
 */
export async function verifyDriverAccessLink(
  token: string
): Promise<VerifyDriverAccessLinkResult> {
  const tokenHash = computeHmacSha256(token);

  const link = await prisma.driverAccessLink.findUnique({
    where: { tokenHash },
    include: {
      waybill: {
        include: {
          organization: true,
          driver: true,
        },
      },
    },
  });

  if (!link) {
    throw new AppError("LINK_NOT_FOUND", "لینک دسترسی نامعتبر است یا یافت نشد.");
  }

  if (link.revokedAt) {
    throw new AppError("LINK_REVOKED", "این لینک دسترسی توسط شرکت ابطال شده است.");
  }

  if (link.expiresAt < new Date()) {
    throw new AppError(
      "LINK_EXPIRED",
      "مهلت استفاده از این لینک منقضی شده است. می‌توانید درخواست ارسال مجدد لینک نمایید."
    );
  }

  // Update access statistics
  await prisma.driverAccessLink.update({
    where: { id: link.id },
    data: {
      accessCount: { increment: 1 },
      lastAccessedAt: new Date(),
    },
  });

  const driverMobile = link.waybill.driverMobileRaw;

  return {
    linkId: link.id,
    organizationId: link.organizationId,
    organizationName: link.waybill.organization.name,
    waybillId: link.waybill.id,
    waybillNumber: link.waybill.waybillNumber,
    driverName: link.waybill.driverNameRaw,
    maskedMobile: maskMobile(driverMobile),
    expiresAt: link.expiresAt,
  };
}

export interface RequestDriverOtpInput {
  token: string;
  clientIp?: string;
}

export interface RequestDriverOtpResult {
  challengeId: string;
  expiresAt: Date;
  maskedMobile: string;
}

/**
 * Requests an SMS OTP with rate-limiting, 5-attempt locking, and suspension checks.
 * (business-rules.md §3, §10 & master-spec 2.5 §6.3 table).
 */
export async function requestDriverOtp(
  input: RequestDriverOtpInput
): Promise<RequestDriverOtpResult> {
  const { token } = input;

  const verifiedLink = await verifyDriverAccessLink(token);
  const { organizationId, waybillId } = verifiedLink;

  const waybill = await prisma.waybill.findUnique({
    where: { id: waybillId },
  });

  if (!waybill) {
    throw new AppError("NOT_FOUND", "بارنامه یافت نشد.");
  }

  const mobile = waybill.driverMobileRaw;
  const now = new Date();

  // 1. Severe lock check: 3 locks in 24 hours -> OTP_MOBILE_SUSPENDED
  const past24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const locksIn24h = await prisma.otpChallenge.count({
    where: {
      organizationId,
      mobile,
      createdAt: { gte: past24h },
      lockedUntil: { not: null },
    },
  });

  if (locksIn24h >= 3) {
    throw new AppError(
      "OTP_MOBILE_SUSPENDED",
      "این شماره موبایل به دلیل تلاش‌های ناموفق مکرر به مدت ۲۴ ساعت معلق شده است. لطفاً با پشتیبانی شرکت تماس بگیرید."
    );
  }

  // 2. Active lock check
  const latestChallenge = await prisma.otpChallenge.findFirst({
    where: { organizationId, mobile },
    orderBy: { createdAt: "desc" },
  });

  if (latestChallenge?.lockedUntil && latestChallenge.lockedUntil > now) {
    const remainingMinutes = Math.ceil(
      (latestChallenge.lockedUntil.getTime() - now.getTime()) / 60000
    );
    throw new AppError(
      "OTP_CHALLENGE_LOCKED",
      `ورود به دلیل تلاش‌های ناموفق قفل شده است. لطفاً پس از ${remainingMinutes} دقیقه مجدداً تلاش فرمایید.`
    );
  }

  // 3. Rate limit check: max 3 requests per 10 minutes
  const past10m = new Date(Date.now() - 10 * 60 * 1000);
  const requestsIn10m = await prisma.otpChallenge.count({
    where: {
      organizationId,
      mobile,
      createdAt: { gte: past10m },
    },
  });

  if (requestsIn10m >= 3) {
    throw new AppError(
      "OTP_RATE_LIMIT_EXCEEDED",
      "تعداد درخواست‌های ارسال کد بیش از حد مجاز است (حداکثر ۳ بار در ۱۰ دقیقه). لطفاً دقایقی بعد تلاش فرمایید."
    );
  }

  // 4. Generate 6-digit OTP code using CSPRNG
  const otpCode = crypto.randomInt(100000, 1000000).toString();
  const codeHash = computeHmacSha256(otpCode);

  const expiresAt = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes TTL

  const challenge = await prisma.otpChallenge.create({
    data: {
      organizationId,
      mobile,
      waybillId,
      codeHash,
      expiresAt,
    },
  });

  // 5. Send SMS with OTP_CODE template
  await sendNotificationSms({
    organizationId,
    recipientMobile: mobile,
    templateKey: "OTP_CODE",
    variables: { code: otpCode },
    waybillId,
  });

  return {
    challengeId: challenge.id,
    expiresAt,
    maskedMobile: maskMobile(mobile),
  };
}

export interface VerifyDriverOtpInput {
  token: string;
  code: string;
  clientIp?: string;
  userAgent?: string;
}

export interface VerifyDriverOtpResult {
  sessionToken: string;
  expiresAt: Date;
  waybillId: string;
}

/**
 * Verifies OTP code with constant-time comparison, handles 5-attempt lock,
 * and creates a 2-hour DB-backed driver session.
 */
export async function verifyDriverOtp(
  input: VerifyDriverOtpInput
): Promise<VerifyDriverOtpResult> {
  const { token, code, clientIp, userAgent } = input;

  const verifiedLink = await verifyDriverAccessLink(token);
  const { organizationId, waybillId } = verifiedLink;

  const waybill = await prisma.waybill.findUnique({
    where: { id: waybillId },
  });

  if (!waybill) {
    throw new AppError("NOT_FOUND", "بارنامه یافت نشد.");
  }

  const mobile = waybill.driverMobileRaw;
  const normalizedCode = normalizeDigits(code.trim());
  const now = new Date();

  // Find latest unverified challenge for this mobile
  const challenge = await prisma.otpChallenge.findFirst({
    where: {
      organizationId,
      mobile,
      verifiedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!challenge) {
    throw new AppError(
      "OTP_EXPIRED",
      "کد اعتبارسنجی معتبری یافت نشد. لطفاً درخواست کد جدید فرمایید."
    );
  }

  if (challenge.lockedUntil && challenge.lockedUntil > now) {
    const remainingMinutes = Math.ceil(
      (challenge.lockedUntil.getTime() - now.getTime()) / 60000
    );
    throw new AppError(
      "OTP_CHALLENGE_LOCKED",
      `ورود به دلیل ۵ تلاش ناموفق مسدود شده است. لطفاً پس از ${remainingMinutes} دقیقه مجدداً تلاش فرمایید.`
    );
  }

  if (challenge.expiresAt < now) {
    throw new AppError(
      "OTP_EXPIRED",
      "مهلت زمانی کد اعتبارسنجی (۳ دقیقه) به پایان رسیده است. لطفاً کد جدید دریافت فرمایید."
    );
  }

  // Constant-time HMAC comparison
  const inputHash = computeHmacSha256(normalizedCode);
  const isMatch =
    inputHash.length === challenge.codeHash.length &&
    crypto.timingSafeEqual(
      Buffer.from(inputHash, "hex"),
      Buffer.from(challenge.codeHash, "hex")
    );

  if (!isMatch) {
    const nextAttempts = challenge.attemptsCount + 1;

    if (nextAttempts >= 5) {
      const lockUntil = new Date(Date.now() + 15 * 60 * 1000); // Lock 15 minutes
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: {
          attemptsCount: nextAttempts,
          lockedUntil: lockUntil,
        },
      });

      throw new AppError(
        "OTP_CHALLENGE_LOCKED",
        "کد واردشده اشتباه است. به دلیل ۵ تلاش ناموفق، دسترسی شما به مدت ۱۵ دقیقه مسدود شد."
      );
    }

    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attemptsCount: nextAttempts },
    });

    const remaining = 5 - nextAttempts;
    throw new AppError(
      "INVALID_OTP_CODE",
      `کد واردشده نادرست است. (${remaining} فرصت دیگر باقی مانده است).`
    );
  }

  // Code verified successfully!
  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { verifiedAt: now },
  });

  // Advance waybill shipmentStatus to DRIVER_VIEWED if imported/ready/notified
  if (
    waybill.shipmentStatus === "IMPORTED" ||
    waybill.shipmentStatus === "READY_FOR_DRIVER" ||
    waybill.shipmentStatus === "DRIVER_NOTIFIED"
  ) {
    await prisma.waybill.update({
      where: { id: waybill.id },
      data: { shipmentStatus: "DRIVER_VIEWED" },
    });
  }

  // Create driver session (absolute 2-hour TTL or link expiry, whichever earlier)
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const sessionTokenHash = computeHmacSha256(sessionToken);

  const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const sessionExpiresAt =
    twoHoursFromNow < verifiedLink.expiresAt ? twoHoursFromNow : verifiedLink.expiresAt;

  await prisma.driverSession.create({
    data: {
      organizationId,
      waybillId,
      driverAccessLinkId: verifiedLink.linkId,
      sessionTokenHash,
      expiresAt: sessionExpiresAt,
      ip: clientIp,
      userAgent,
    },
  });

  return {
    sessionToken,
    expiresAt: sessionExpiresAt,
    waybillId,
  };
}

export interface ValidatedDriverSession {
  sessionId: string;
  organizationId: string;
  waybillId: string;
  linkId: string;
  expiresAt: Date;
}

/**
 * Validates driver session token. Checks revocation on both session and parent link.
 */
export async function validateDriverSession(
  sessionToken: string
): Promise<ValidatedDriverSession> {
  const sessionTokenHash = computeHmacSha256(sessionToken);

  const session = await prisma.driverSession.findUnique({
    where: { sessionTokenHash },
    include: { accessLink: true },
  });

  if (!session) {
    throw new AppError("UNAUTHORIZED", "نشست راننده یافت نشد یا معتبر نیست.");
  }

  if (session.revokedAt) {
    throw new AppError("SESSION_REVOKED", "نشست شما باطل شده است.");
  }

  if (session.expiresAt < new Date()) {
    throw new AppError("SESSION_EXPIRED", "نشست شما منقضی شده است. لطفاً مجدداً وارد شوید.");
  }

  if (session.accessLink.revokedAt) {
    throw new AppError("LINK_REVOKED", "لینک دسترسی این بارنامه باطل شده است.");
  }

  return {
    sessionId: session.id,
    organizationId: session.organizationId,
    waybillId: session.waybillId,
    linkId: session.driverAccessLinkId,
    expiresAt: session.expiresAt,
  };
}

/**
 * Revoking an access link terminates all associated active driver sessions immediately.
 */
export async function revokeDriverAccessLink(linkId: string): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.driverAccessLink.update({
      where: { id: linkId },
      data: { revokedAt: now },
    }),
    prisma.driverSession.updateMany({
      where: { driverAccessLinkId: linkId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
}
