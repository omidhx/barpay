import { prisma } from "@/lib/db/client";
import { NotificationJobStatus } from "@prisma/client";
import { AppError } from "@/lib/errors/exceptions";
import { FailoverSmsProvider } from "./sms-provider";
import { getSmsProvider } from "./notification-service";

/**
 * Translates raw technical / provider error messages into simple, clear Persian
 * for operators to understand why an SMS failed and take appropriate action (phone follow-up).
 * Follows master-spec §11.1 (پاسخ سوال ۱۶).
 */
export function mapErrorToPersianReason(lastError?: string | null): string {
  if (!lastError) {
    return "پیامک به دست راننده نرسیده و ارسال با خطا مواجه شد.";
  }

  const err = lastError.toLowerCase();

  if (
    err.includes("خاموش") ||
    err.includes("off") ||
    err.includes("unreachable") ||
    err.includes("power off") ||
    err.includes("absent")
  ) {
    return "تلفن راننده خاموش یا خارج از دسترس بوده است.";
  }

  if (
    err.includes("invalid") ||
    err.includes("نامعتبر") ||
    err.includes("mobile") ||
    err.includes("شماره")
  ) {
    return "شماره تلفن همراه راننده نامعتبر است.";
  }

  if (
    err.includes("blacklist") ||
    err.includes("لیست سیاه") ||
    err.includes("تبلیغات") ||
    err.includes("blocked")
  ) {
    return "شماره راننده دریافت پیامک‌های تبلیغاتی/خدماتی را مسدود کرده است (لیست سیاه).";
  }

  if (
    err.includes("cap") ||
    err.includes("سقف") ||
    err.includes("sms_daily_cap_exceeded")
  ) {
    return "سقف مجاز ارسال روزانه پیامک سازمان تکمیل شده است.";
  }

  if (
    err.includes("timeout") ||
    err.includes("مهلت زمانی") ||
    err.includes("timed out")
  ) {
    return "عدم پاسخگویی درگاه پیامک در مهلت زمانی مجاز (تایم‌اوت ۱۰ ثانیه).";
  }

  if (
    err.includes("connection") ||
    err.includes("network") ||
    err.includes("fetch") ||
    err.includes("econnrefused")
  ) {
    return "خطای ارتباط شبکه با سرور ارائه‌دهنده پیامک.";
  }

  if (
    err.includes("auth") ||
    err.includes("api_key") ||
    err.includes("اعتبارنامه") ||
    err.includes("unauthorized")
  ) {
    return "اعتبارنامه یا کلید دسترسی سامانه پیامک نامعتبر است.";
  }

  if (err.includes("unknown_sms_template")) {
    return "قالب پیامک درخواستی در سامانه تعریف نشده است.";
  }

  return `خطای ارسال پیامک: ${lastError}`;
}

export interface SmsMonitoringDashboardData {
  dailyStats: {
    dailyCap: number;
    sentToday: number;
    failedToday: number;
    pendingToday: number;
    remainingToday: number;
    usagePercent: number;
    isWarningThreshold: boolean; // true when >= 80%
  };
  circuitBreaker: {
    primaryProvider: string;
    secondaryProvider: string;
    primaryState: "CLOSED" | "OPEN" | "HALF_OPEN";
    isFailoverActive: boolean;
  };
  recentFailures: Array<{
    id: string;
    recipient: string;
    templateKey: string;
    persianReason: string;
    rawError: string | null;
    createdAt: Date;
    attempts: number;
  }>;
}

/**
 * Returns complete SMS monitoring metrics for the operator dashboard.
 */
export async function getSmsMonitoringDashboard(
  organizationId: string
): Promise<SmsMonitoringDashboardData> {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });
  const dailyCap = settings?.smsDailyCap ?? 2000;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [sentToday, failedToday, pendingToday, recentFailuresRaw] = await Promise.all([
    prisma.notificationJob.count({
      where: {
        organizationId,
        createdAt: { gte: startOfDay },
        status: "SENT",
      },
    }),
    prisma.notificationJob.count({
      where: {
        organizationId,
        createdAt: { gte: startOfDay },
        status: "FAILED",
      },
    }),
    prisma.notificationJob.count({
      where: {
        organizationId,
        createdAt: { gte: startOfDay },
        status: { in: ["PENDING", "PROCESSING", "RETRYING"] },
      },
    }),
    prisma.notificationJob.findMany({
      where: {
        organizationId,
        status: "FAILED",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const usedToday = sentToday + pendingToday;
  const remainingToday = Math.max(0, dailyCap - usedToday);
  const usagePercent = Math.min(100, Math.round((usedToday / dailyCap) * 100));
  const isWarningThreshold = usedToday >= Math.floor(dailyCap * 0.8);

  // Check Circuit Breaker Status
  const provider = getSmsProvider();
  let primaryProvider = "FARAZSMS";
  let secondaryProvider = "MELIPAYAMAK";
  let primaryState: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";

  if (provider instanceof FailoverSmsProvider) {
    primaryProvider = provider.primary.name;
    secondaryProvider = provider.secondary.name;
    primaryState = provider.circuitBreaker.getState();
  }

  const recentFailures = recentFailuresRaw.map((f) => ({
    id: f.id,
    recipient: f.recipient,
    templateKey: f.templateKey,
    persianReason: mapErrorToPersianReason(f.lastError),
    rawError: f.lastError,
    createdAt: f.createdAt,
    attempts: f.attempts,
  }));

  return {
    dailyStats: {
      dailyCap,
      sentToday,
      failedToday,
      pendingToday,
      remainingToday,
      usagePercent,
      isWarningThreshold,
    },
    circuitBreaker: {
      primaryProvider,
      secondaryProvider,
      primaryState,
      isFailoverActive: primaryState === "OPEN",
    },
    recentFailures,
  };
}

export interface ListSmsJobsOptions {
  organizationId: string;
  status?: NotificationJobStatus;
  recipient?: string;
  templateKey?: string;
  limit?: number;
  offset?: number;
}

/**
 * Lists SMS notification jobs with filters and Persian error mapping.
 */
export async function listSmsJobs(options: ListSmsJobsOptions) {
  const { organizationId, status, recipient, templateKey, limit = 50, offset = 0 } = options;

  const where = {
    organizationId,
    ...(status ? { status } : {}),
    ...(recipient ? { recipient: { contains: recipient } } : {}),
    ...(templateKey ? { templateKey } : {}),
  };

  const [rawItems, total] = await Promise.all([
    prisma.notificationJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
      skip: offset,
    }),
    prisma.notificationJob.count({ where }),
  ]);

  const items = rawItems.map((job) => ({
    ...job,
    persianReason: job.lastError ? mapErrorToPersianReason(job.lastError) : null,
  }));

  return { items, total };
}

/**
 * Retries a failed SMS job.
 */
export async function retrySmsJob(jobId: string, organizationId: string) {
  const job = await prisma.notificationJob.findFirst({
    where: { id: jobId, organizationId },
  });

  if (!job) {
    throw new AppError("NOT_FOUND", "پیامک مورد نظر یافت نشد.");
  }

  if (job.status !== "FAILED") {
    throw new AppError(
      "INVALID_STATE",
      "تنها پیامک‌های با وضعیت ناموفق (FAILED) قابل ارسال مجدد هستند."
    );
  }

  const payload = job.payloadJson as { text?: string; variables?: Record<string, string> } | null;
  const messageText = payload?.text || "پیام بارنامه‌پی";

  const provider = getSmsProvider();

  // Reset to RETRYING and increment attempts
  await prisma.notificationJob.update({
    where: { id: job.id },
    data: {
      status: "RETRYING",
      attempts: { increment: 1 },
      lastError: null,
    },
  });

  try {
    const result = await provider.send(job.recipient, messageText, job.id);

    return await prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        status: "SENT",
        provider: result.provider,
        providerMessageId: result.messageId,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return await prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        lastError: errorMsg,
      },
    });
  }
}
