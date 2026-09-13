import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors/exceptions";

export interface CreateNotificationInput {
  organizationId: string;
  userId?: string | null;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

export interface GetNotificationsOptions {
  organizationId: string;
  userId?: string;
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Creates an in-app notification atomically. Can participate in an active Prisma transaction.
 */
export async function createNotification(
  input: CreateNotificationInput,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { organizationId, userId, title, message, entityType, entityId } = input;

  return client.notification.create({
    data: {
      organizationId,
      userId: userId ?? null,
      title,
      message,
      entityType,
      entityId,
    },
  });
}

/**
 * Retrieves notifications for an organization and user with pagination.
 */
export async function getNotifications(options: GetNotificationsOptions) {
  const { organizationId, userId, unreadOnly = false, limit = 20, offset = 0 } = options;

  const where: Prisma.NotificationWhereInput = {
    organizationId,
    ...(userId
      ? {
          OR: [{ userId }, { userId: null }],
        }
      : {}),
    ...(unreadOnly ? { isRead: false } : {}),
  };

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
      skip: offset,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: {
        organizationId,
        ...(userId
          ? {
              OR: [{ userId }, { userId: null }],
            }
          : {}),
        isRead: false,
      },
    }),
  ]);

  return { items, total, unreadCount };
}

/**
 * Returns unread notification count for badge / bell indicator.
 */
export async function getUnreadCount(organizationId: string, userId?: string): Promise<number> {
  return prisma.notification.count({
    where: {
      organizationId,
      ...(userId
        ? {
            OR: [{ userId }, { userId: null }],
          }
        : {}),
      isRead: false,
    },
  });
}

/**
 * Marks a single notification as read.
 */
export async function markNotificationAsRead(
  id: string,
  organizationId: string,
  userId?: string
) {
  const notification = await prisma.notification.findFirst({
    where: {
      id,
      organizationId,
      ...(userId ? { OR: [{ userId }, { userId: null }] } : {}),
    },
  });

  if (!notification) {
    throw new AppError("NOT_FOUND", "اعلان مورد نظر یافت نشد.");
  }

  return prisma.notification.update({
    where: { id },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
}

/**
 * Marks all notifications for user as read.
 */
export async function markAllNotificationsAsRead(
  organizationId: string,
  userId?: string
) {
  return prisma.notification.updateMany({
    where: {
      organizationId,
      ...(userId ? { OR: [{ userId }, { userId: null }] } : {}),
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
}

/**
 * Domain Event Helpers
 */
export async function notifyPaymentSubmitted(params: {
  organizationId: string;
  waybillId: string;
  waybillNumber: string;
  amount: bigint;
  driverName?: string;
  paymentId: string;
  client?: Prisma.TransactionClient | typeof prisma;
}) {
  const client = params.client || prisma;
  return createNotification(
    {
      organizationId: params.organizationId,
      title: "ثبت پرداخت دستی جدید",
      message: `پرداخت بارنامه ${params.waybillNumber}${params.driverName ? ` (راننده: ${params.driverName})` : ""} به مبلغ ${params.amount.toLocaleString("fa-IR")} ریال ثبت شد و در صف بررسی قرار گرفت.`,
      entityType: "PAYMENT",
      entityId: params.paymentId,
    },
    client
  );
}

export async function notifyRefundRequested(params: {
  organizationId: string;
  waybillId: string;
  waybillNumber: string;
  amount: bigint;
  refundId: string;
  requestedBy: string;
  client?: Prisma.TransactionClient | typeof prisma;
}) {
  const client = params.client || prisma;
  return createNotification(
    {
      organizationId: params.organizationId,
      title: "درخواست بازگشت وجه نیازمند تأیید",
      message: `درخواست بازگشت وجه برای بارنامه ${params.waybillNumber} به مبلغ ${params.amount.toLocaleString("fa-IR")} ریال توسط ${params.requestedBy} ثبت شده و در انتظار تأیید سرپرست است.`,
      entityType: "REFUND",
      entityId: params.refundId,
    },
    client
  );
}

export async function notifyPdfUnmatched(params: {
  organizationId: string;
  filename: string;
  client?: Prisma.TransactionClient | typeof prisma;
}) {
  const client = params.client || prisma;
  return createNotification(
    {
      organizationId: params.organizationId,
      title: "فایل PDF بدون تطبیق",
      message: `فایل «${params.filename}» بارگذاری شد اما شماره بارنامه معتبری در سامانه برای تطبیق خودکار با آن یافت نشد.`,
      entityType: "DOCUMENT",
    },
    client
  );
}

export async function notifySmsFailed(params: {
  organizationId: string;
  recipient: string;
  reason: string;
  jobId: string;
  client?: Prisma.TransactionClient | typeof prisma;
}) {
  const client = params.client || prisma;
  return createNotification(
    {
      organizationId: params.organizationId,
      title: "هشدار: ارسال پیامک ناموفق",
      message: `ارسال پیامک به شماره ${params.recipient} با شکست مواجه شد: ${params.reason}`,
      entityType: "NOTIFICATION_JOB",
      entityId: params.jobId,
    },
    client
  );
}
