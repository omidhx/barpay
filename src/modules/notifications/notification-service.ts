import { prisma } from "@/lib/db/client";
import { AppError } from "@/lib/errors/exceptions";
import { FailoverSmsProvider, MockSmsProvider, SmsProvider } from "./sms-provider";

export const SMS_TEMPLATES: Record<string, (vars: Record<string, string>) => string> = {
  OTP_CODE: (v) => `کد ورود شما به سامانه بارنامه‌پی: ${v.code}\nاین کد تا ۳ دقیقه معتبر است.`,
  DRIVER_LINK: (v) => `راننده گرامی جناب ${v.driverName}،\nاطلاعات بارنامه شماره ${v.waybillNumber} آماده است. جهت مشاهده و تکمیل فرایند:\n${v.url}`,
  COMMITMENT_ACCEPTED_ACK: (v) => `اقرار الکترونیکی و پذیرش تعهدنامه شما برای بارنامه ${v.waybillNumber} با موفقیت ثبت شد.`,
  PAYMENT_CONFIRMED: (v) => `پرداخت بارنامه ${v.waybillNumber} به مبلغ ${v.amount} ریال تأیید گردید.`,
  RESIDUAL_LINK: (v) => `راننده گرامی، مبلغ مابقی بارنامه ${v.waybillNumber} به میزان ${v.amount} ریال صادر گردید:\n${v.url}`,
};

let globalSmsProvider: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (!globalSmsProvider) {
    if (process.env.NODE_ENV === "test" || !process.env.FARAZSMS_API_KEY) {
      globalSmsProvider = new MockSmsProvider();
    } else {
      globalSmsProvider = new FailoverSmsProvider();
    }
  }
  return globalSmsProvider;
}

export function setSmsProvider(provider: SmsProvider): void {
  globalSmsProvider = provider;
}

export interface SendSmsInput {
  organizationId: string;
  recipientMobile: string;
  templateKey: string;
  variables: Record<string, string>;
  waybillId?: string;
}

export async function sendNotificationSms(input: SendSmsInput) {
  const { organizationId, recipientMobile, templateKey, variables } = input;

  // 1. Check template definition
  const templateRenderer = SMS_TEMPLATES[templateKey];
  if (!templateRenderer) {
    throw new AppError(
      "UNKNOWN_SMS_TEMPLATE",
      `قالب پیامک با شناسه «${templateKey}» تعریف نشده است.`
    );
  }

  const messageText = templateRenderer(variables);

  // 2. Check organization daily cap (business-rules.md §10)
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });

  const dailyCap = settings?.smsDailyCap ?? 2000;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todayCount = await prisma.notificationJob.count({
    where: {
      organizationId,
      createdAt: { gte: startOfDay },
      status: { not: "FAILED" },
    },
  });

  if (todayCount >= dailyCap) {
    throw new AppError(
      "SMS_DAILY_CAP_EXCEEDED",
      `سقف مجاز ارسال روزانه پیامک سازمان (${dailyCap} پیام) تکمیل شده است.`
    );
  }

  // 3. Create job record in DB
  const job = await prisma.notificationJob.create({
    data: {
      organizationId,
      channel: "SMS",
      recipient: recipientMobile,
      templateKey,
      payloadJson: { variables, text: messageText },
      status: "PENDING",
    },
  });

  // 4. Send via provider
  const provider = getSmsProvider();
  try {
    const result = await provider.send(recipientMobile, messageText, job.id);

    const updated = await prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        status: "SENT",
        provider: result.provider,
        providerMessageId: result.messageId,
      },
    });

    return updated;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        lastError: errorMsg,
      },
    });

    throw err;
  }
}
