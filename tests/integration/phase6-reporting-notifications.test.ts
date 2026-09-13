import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  getDashboardSummary,
  getApprovedPaymentsReport,
  getRoundingExcessReport,
  getGatewayTransactionsReport,
  getOperatorPerformanceReport,
} from "@/modules/reports/reporting-service";
import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  notifyPaymentSubmitted,
} from "@/modules/notifications/in-app-notification-service";
import {
  getSmsMonitoringDashboard,
  retrySmsJob,
} from "@/modules/notifications/sms-monitoring-service";
import { setSmsProvider } from "@/modules/notifications/notification-service";
import { MockSmsProvider } from "@/modules/notifications/sms-provider";

describe("Phase 6 — Reporting, Dashboard, Notifications & SMS Monitoring (PostgreSQL 16)", () => {
  let orgId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Setup Mock SMS Provider for tests
    setSmsProvider(new MockSmsProvider());

    const org = await prisma.organization.create({
      data: {
        name: `سازمان آزمون گزارش‌ها ${Date.now()}`,
        slug: `report-org-${Date.now()}`,
        settings: {
          create: {
            smsDailyCap: 10, // Small cap to test 80% threshold easily
            roundMultiple: BigInt(50000),
            surchargeAmount: BigInt(700000),
          },
        },
      },
    });
    orgId = org.id;

    const user = await prisma.user.create({
      data: {
        organizationId: orgId,
        mobile: "09120000099",
        fullName: "متصدی آزمون گزارش",
        role: "OPERATOR",
        passwordHash: "dummy-hash",
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    if (orgId) {
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
    }
  });

  it("calculates live dashboard summary using deriveWaybillPhase and real DB data", async () => {
    // 1. Create waybills across various status axes
    // WB1: IMPORTED
    const wb1 = await prisma.waybill.create({
      data: {
        organizationId: orgId,
        waybillNumber: `WB-REP-1-${Date.now()}`,
        driverNameRaw: "راننده یک",
        driverMobileRaw: "09121111111",
        issueDate: new Date(),
        shipmentStatus: "IMPORTED",
        documentStatus: "NOT_UPLOADED",
        commitmentStatus: "NOT_REQUIRED",
        paymentStatus: "NOT_REQUIRED",
        releaseStatus: "BLOCKED",
      },
    });

    // WB2: PDF_ATTACHED
    const wb2 = await prisma.waybill.create({
      data: {
        organizationId: orgId,
        waybillNumber: `WB-REP-2-${Date.now()}`,
        driverNameRaw: "راننده دو",
        driverMobileRaw: "09122222222",
        issueDate: new Date(),
        shipmentStatus: "READY_FOR_DRIVER",
        documentStatus: "VERIFIED",
        commitmentStatus: "PENDING",
        paymentStatus: "NOT_SUBMITTED",
        releaseStatus: "BLOCKED",
      },
    });

    // WB3: RELEASED + Approved Payment
    const wb3 = await prisma.waybill.create({
      data: {
        organizationId: orgId,
        waybillNumber: `WB-REP-3-${Date.now()}`,
        driverNameRaw: "راننده سه",
        driverMobileRaw: "09123333333",
        issueDate: new Date(),
        shipmentStatus: "DRIVER_VIEWED",
        documentStatus: "VERIFIED",
        commitmentStatus: "ACCEPTED",
        paymentStatus: "APPROVED",
        releaseStatus: "RELEASED",
      },
    });

    const amount3 = await prisma.waybillAmount.create({
      data: {
        organizationId: orgId,
        waybillId: wb3.id,
        rawExcelAmount: BigInt(80686445),
        roundedAmount: BigInt(80700000),
        surchargeAmount: BigInt(700000),
        amount: BigInt(81400000),
        isCurrent: true,
        status: "APPROVED",
      },
    });

    await prisma.waybill.update({
      where: { id: wb3.id },
      data: { currentAmountId: amount3.id },
    });

    // Create payment for WB3
    const payment = await prisma.payment.create({
      data: {
        organizationId: orgId,
        waybillId: wb3.id,
        waybillAmountId: amount3.id,
        method: "CARD_TO_CARD",
        status: "APPROVED",
        amount: BigInt(81400000),
        trackingNumber: "TRK-8888",
        reviewedBy: testUserId,
        reviewedAt: new Date(),
      },
    });

    // Create review for operator report
    await prisma.paymentReview.create({
      data: {
        organizationId: orgId,
        paymentId: payment.id,
        reviewerId: testUserId,
        decision: "APPROVED",
        notes: "تأیید خودکار درگاه",
      },
    });

    const summary = await getDashboardSummary(orgId);

    expect(summary.kpis.totalWaybills).toBeGreaterThanOrEqual(3);
    expect(summary.phases.IMPORTED).toBeGreaterThanOrEqual(1);
    expect(summary.phases.PDF_ATTACHED).toBeGreaterThanOrEqual(1);
    expect(summary.phases.RELEASED).toBeGreaterThanOrEqual(1);
    expect(summary.kpis.totalPaidAmount).toBeGreaterThanOrEqual(BigInt(81400000));
  });

  it("calculates cumulative rounding excess report accurately with golden values", async () => {
    const wb = await prisma.waybill.create({
      data: {
        organizationId: orgId,
        waybillNumber: `WB-ROUND-${Date.now()}`,
        driverNameRaw: "راننده گرد کردن",
        driverMobileRaw: "09124444444",
        issueDate: new Date(),
        shipmentStatus: "READY_FOR_DRIVER",
        documentStatus: "VERIFIED",
        commitmentStatus: "PENDING",
        paymentStatus: "NOT_SUBMITTED",
        releaseStatus: "BLOCKED",
      },
    });

    // Official Example 1: raw 80,686,445 -> rounded 80,700,000 -> excess 13,555 -> payable 81,400,000
    await prisma.waybillAmount.create({
      data: {
        organizationId: orgId,
        waybillId: wb.id,
        rawExcelAmount: BigInt(80686445),
        roundedAmount: BigInt(80700000),
        surchargeAmount: BigInt(700000),
        amount: BigInt(81400000),
        isCurrent: true,
        status: "APPROVED",
      },
    });

    const report = await getRoundingExcessReport({ organizationId: orgId });

    expect(report.summary.totalRawAmount).toBeGreaterThanOrEqual(BigInt(80686445));
    expect(report.summary.totalRoundedAmount).toBeGreaterThanOrEqual(BigInt(80700000));
    expect(report.summary.totalRoundingExcess).toBeGreaterThanOrEqual(BigInt(13555));
    expect(report.summary.totalSurcharge).toBeGreaterThanOrEqual(BigInt(700000));
    expect(report.summary.roundedUpCount).toBeGreaterThanOrEqual(1);
  });

  it("queries approved payments report and operator throughput", async () => {
    const paymentsReport = await getApprovedPaymentsReport({
      organizationId: orgId,
    });
    expect(paymentsReport.totalCount).toBeGreaterThanOrEqual(1);
    expect(paymentsReport.items[0].amount).toBeDefined();

    const operatorReport = await getOperatorPerformanceReport({
      organizationId: orgId,
    });
    expect(operatorReport.length).toBeGreaterThanOrEqual(1);
    const op = operatorReport.find((o) => o.reviewerId === testUserId);
    expect(op).toBeDefined();
    expect(op?.approvedCount).toBeGreaterThanOrEqual(1);
  });

  it("supports in-app notification center lifecycle: create, count, query, mark-read, mark-all", async () => {
    // 1. Create notifications
    const n1 = await createNotification({
      organizationId: orgId,
      userId: testUserId,
      title: "اعلان تستی ۱",
      message: "پیام تستی ۱",
    });

    await notifyPaymentSubmitted({
      organizationId: orgId,
      waybillId: "wb-dummy-id",
      waybillNumber: "14039999",
      amount: BigInt(5000000),
      paymentId: "pay-dummy-id",
    });

    // 2. Query unread count
    const unread = await getUnreadCount(orgId, testUserId);
    expect(unread).toBeGreaterThanOrEqual(2);

    // 3. Mark single notification as read
    const marked = await markNotificationAsRead(n1.id, orgId, testUserId);
    expect(marked.isRead).toBe(true);
    expect(marked.readAt).not.toBeNull();

    // 4. Mark all as read
    await markAllNotificationsAsRead(orgId, testUserId);
    const unreadAfter = await getUnreadCount(orgId, testUserId);
    expect(unreadAfter).toBe(0);

    // 5. Query all notifications list
    const list = await getNotifications({ organizationId: orgId, userId: testUserId });
    expect(list.total).toBeGreaterThanOrEqual(2);
    expect(list.unreadCount).toBe(0);
  });

  it("tracks SMS monitoring, daily limit 80% warning threshold, Persian error reasons and retries failed job", async () => {
    // Daily cap is set to 10 for this org.
    // Create 7 SENT jobs -> used = 7 (70% < 80%)
    for (let i = 0; i < 7; i++) {
      await prisma.notificationJob.create({
        data: {
          organizationId: orgId,
          channel: "SMS",
          recipient: `0912111000${i}`,
          templateKey: "DRIVER_LINK",
          payloadJson: { text: "تست" },
          status: "SENT",
        },
      });
    }

    let dashboard = await getSmsMonitoringDashboard(orgId);
    expect(dashboard.dailyStats.sentToday).toBe(7);
    expect(dashboard.dailyStats.isWarningThreshold).toBe(false);

    // Add 1 more job -> used = 8 (80% of 10) -> isWarningThreshold becomes TRUE
    await prisma.notificationJob.create({
      data: {
        organizationId: orgId,
        channel: "SMS",
        recipient: "09121110008",
        templateKey: "DRIVER_LINK",
        payloadJson: { text: "تست" },
        status: "SENT",
      },
    });

    dashboard = await getSmsMonitoringDashboard(orgId);
    expect(dashboard.dailyStats.sentToday).toBe(8);
    expect(dashboard.dailyStats.isWarningThreshold).toBe(true);

    // Create a FAILED job with technical error message
    const failedJob = await prisma.notificationJob.create({
      data: {
        organizationId: orgId,
        channel: "SMS",
        recipient: "09129999999",
        templateKey: "DRIVER_LINK",
        payloadJson: { text: "لینک ورود راننده" },
        status: "FAILED",
        lastError: "Recipient handset is power off / absent",
        attempts: 1,
      },
    });

    dashboard = await getSmsMonitoringDashboard(orgId);
    const failureItem = dashboard.recentFailures.find((f) => f.id === failedJob.id);
    expect(failureItem).toBeDefined();
    expect(failureItem?.persianReason).toContain("خاموش یا خارج از دسترس");

    // Retry the failed SMS job
    const retried = await retrySmsJob(failedJob.id, orgId);
    expect(retried.status).toBe("SENT");
    expect(retried.attempts).toBe(2);
  });
});
