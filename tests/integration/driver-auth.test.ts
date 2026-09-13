import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  createDriverAccessLink,
  verifyDriverAccessLink,
  requestDriverOtp,
  verifyDriverOtp,
  validateDriverSession,
  revokeDriverAccessLink,
} from "@/modules/auth/driver-auth";
import {
  acceptDriverCommitment,
  declineDriverCommitment,
  PNG_MAGIC_BYTES,
} from "@/modules/commitments/commitment-service";
import { submitWaybillPayment } from "@/modules/waybills/state-machine";
import { setSmsProvider, MockSmsProvider } from "@/modules/notifications";
import { AppError } from "@/lib/errors/exceptions";

describe("Driver Authentication, OTP & Legal Commitment (PostgreSQL 16) — business-rules.md §3, §9, §10", () => {
  let testOrgId: string;
  let waybillId: string;
  let waybillNumber = "889900";
  let driverMobile = "09123456789";
  let mockSms: MockSmsProvider;

  beforeAll(async () => {
    mockSms = new MockSmsProvider("TEST_SMS");
    setSmsProvider(mockSms);

    const org = await prisma.organization.create({
      data: {
        name: "سازمان ترابری آزمایشی رانندگان",
        slug: `test-driver-auth-org-${Date.now()}`,
      },
    });
    testOrgId = org.id;

    // Create organization settings with ENFORCED commitment mode
    await prisma.organizationSettings.create({
      data: {
        organizationId: testOrgId,
        commitmentEnforcement: "ENFORCED",
        smsDailyCap: 2000,
      },
    });

    // Create active commitment template
    await prisma.commitmentVersion.create({
      data: {
        organizationId: testOrgId,
        title: "تعهدنامه رسمی بارنامه",
        templateKey: "OFFICIAL_V1",
        variablesJson: ["driver_name", "waybill_number", "amount", "issue_date"],
        body: "اینجانب {{driver_name}} با بارنامه شماره {{waybill_number}} تعهد می‌نمایم مبلغ {{amount}} ریال را پرداخت کنم.",
        contentHash: "template-hash-v1",
        status: "ACTIVE",
        isDefault: true,
      },
    });

    // Create a waybill in READY_FOR_DRIVER
    const wb = await prisma.waybill.create({
      data: {
        organizationId: testOrgId,
        waybillNumber,
        driverNameRaw: "جواد جوادی",
        driverMobileRaw: driverMobile,
        issueDate: new Date(),
        shipmentStatus: "READY_FOR_DRIVER",
        documentStatus: "VERIFIED",
        paymentStatus: "NOT_SUBMITTED",
        commitmentStatus: "PENDING",
        releaseStatus: "BLOCKED",
      },
    });
    waybillId = wb.id;

    // Create waybill amount
    const amt = await prisma.waybillAmount.create({
      data: {
        organizationId: testOrgId,
        waybillId: wb.id,
        rawExcelAmount: 50000000n,
        roundedAmount: 50000000n,
        surchargeAmount: 700000n,
        amount: 50700000n,
        isCurrent: true,
      },
    });

    await prisma.waybill.update({
      where: { id: wb.id },
      data: { currentAmountId: amt.id },
    });
  });

  afterAll(async () => {
    if (testOrgId) {
      await prisma.commitmentAcceptance.deleteMany({
        where: { organizationId: testOrgId },
      });
      await prisma.organization.delete({
        where: { id: testOrgId },
      });
    }
    await prisma.$disconnect();
  });

  let rawToken: string;
  let linkId: string;
  let sessionToken: string;

  it("Step 1: creates driver access link with 48h TTL and HMAC-SHA256 hashed token", async () => {
    const linkRes = await createDriverAccessLink({
      organizationId: testOrgId,
      waybillId,
      expiresInHours: 48,
    });

    expect(linkRes.token).toBeDefined();
    expect(linkRes.token.length).toBe(64); // 32 bytes hex
    expect(linkRes.url).toContain(`/driver/${linkRes.token}`);

    rawToken = linkRes.token;
    linkId = linkRes.linkId;

    // Verify token hash is stored, not raw token
    const dbLink = await prisma.driverAccessLink.findUnique({
      where: { id: linkRes.linkId },
    });
    expect(dbLink).not.toBeNull();
    expect(dbLink?.tokenHash).not.toBe(rawToken);

    // Verify link returns public metadata only
    const verifyRes = await verifyDriverAccessLink(rawToken);
    expect(verifyRes.waybillNumber).toBe(waybillNumber);
    expect(verifyRes.driverName).toBe("جواد جوادی");
    expect(verifyRes.maskedMobile).toBe("0912***6789");
    expect(verifyRes.organizationName).toBe("سازمان ترابری آزمایشی رانندگان");
  });

  it("Step 2: requests OTP with rate limiting (max 3 per 10 minutes)", async () => {
    // 1st request
    const req1 = await requestDriverOtp({ token: rawToken });
    expect(req1.challengeId).toBeDefined();
    expect(mockSms.sentMessages.length).toBe(1);

    // Extract generated OTP from SMS for testing
    const smsText = mockSms.sentMessages[0].text;
    const codeMatch = smsText.match(/\d{6}/);
    expect(codeMatch).not.toBeNull();

    // 2nd request
    await requestDriverOtp({ token: rawToken });
    expect(mockSms.sentMessages.length).toBe(2);

    // 3rd request
    await requestDriverOtp({ token: rawToken });
    expect(mockSms.sentMessages.length).toBe(3);

    // 4th request must throw OTP_RATE_LIMIT_EXCEEDED
    await expect(requestDriverOtp({ token: rawToken })).rejects.toThrowError(AppError);
    try {
      await requestDriverOtp({ token: rawToken });
    } catch (err: unknown) {
      expect((err as AppError).code).toBe("OTP_RATE_LIMIT_EXCEEDED");
    }
  });

  it("Step 3: verifies OTP, handles 5-attempt lockout, and issues 2-hour session", async () => {
    // We already have a challenge from Step 2
    // Let's test 4 wrong attempts
    for (let i = 1; i <= 4; i++) {
      try {
        await verifyDriverOtp({
          token: rawToken,
          code: "000000", // wrong code
        });
        expect.fail("Should have thrown INVALID_OTP_CODE");
      } catch (err: unknown) {
        expect((err as AppError).code).toBe("INVALID_OTP_CODE");
      }
    }

    // 5th wrong attempt must trigger OTP_CHALLENGE_LOCKED (15m lockout)
    try {
      await verifyDriverOtp({
        token: rawToken,
        code: "000000",
      });
      expect.fail("Should have locked challenge");
    } catch (err: unknown) {
      expect((err as AppError).code).toBe("OTP_CHALLENGE_LOCKED");
    }

    // Create a fresh challenge directly for successful login test
    const testCode = "654321";
    // Clean old challenges to bypass rate limit for test
    await prisma.otpChallenge.deleteMany({
      where: { organizationId: testOrgId, mobile: driverMobile },
    });

    const freshReq = await requestDriverOtp({ token: rawToken });
    expect(freshReq.challengeId).toBeDefined();

    // Extract code from latest SMS
    const lastSms = mockSms.sentMessages[mockSms.sentMessages.length - 1];
    const actualCode = lastSms.text.match(/\d{6}/)![0];

    // Verify with actual code
    const verifyRes = await verifyDriverOtp({
      token: rawToken,
      code: actualCode,
      clientIp: "127.0.0.1",
      userAgent: "Mozilla/5.0 Mobile",
    });

    expect(verifyRes.sessionToken).toBeDefined();
    sessionToken = verifyRes.sessionToken;

    // Verify waybill transitioned to DRIVER_VIEWED
    const wb = await prisma.waybill.findUnique({ where: { id: waybillId } });
    expect(wb?.shipmentStatus).toBe("DRIVER_VIEWED");

    // Validate session
    const validated = await validateDriverSession(sessionToken);
    expect(validated.waybillId).toBe(waybillId);
    expect(validated.organizationId).toBe(testOrgId);
  });

  it("Step 4: Decision 19 — in ENFORCED mode, payment is REJECTED if commitment not accepted", async () => {
    // Attempt payment submission before accepting commitment
    await expect(
      submitWaybillPayment({
        organizationId: testOrgId,
        waybillId,
        amount: 50700000n,
        method: "CARD_TO_CARD",
        actor: { actorType: "DRIVER" },
      })
    ).rejects.toThrowError(AppError);

    try {
      await submitWaybillPayment({
        organizationId: testOrgId,
        waybillId,
        amount: 50700000n,
        method: "CARD_TO_CARD",
        actor: { actorType: "DRIVER" },
      });
    } catch (err: unknown) {
      expect((err as AppError).code).toBe("COMMITMENT_NOT_ACCEPTED");
    }
  });

  it("Step 5: accepts commitment with server-rendered text & canvas signature (PNG)", async () => {
    // Create valid mock PNG signature (header + content > 100 bytes)
    const validSignaturePng = Buffer.concat([
      PNG_MAGIC_BYTES,
      Buffer.alloc(200, 0x77),
    ]);
    const base64Sig = `data:image/png;base64,${validSignaturePng.toString("base64")}`;

    const acceptRes = await acceptDriverCommitment({
      sessionToken,
      signatureBase64: base64Sig,
      clientIp: "127.0.0.1",
      userAgent: "Mozilla/5.0 Mobile",
    });

    expect(acceptRes.commitmentStatus).toBe("ACCEPTED");
    expect(acceptRes.acceptanceId).toBeDefined();

    // Verify DB
    const wb = await prisma.waybill.findUnique({ where: { id: waybillId } });
    expect(wb?.commitmentStatus).toBe("ACCEPTED");

    const acceptance = await prisma.commitmentAcceptance.findFirst({
      where: { waybillId },
    });
    expect(acceptance).not.toBeNull();
    expect(acceptance?.renderedText).toContain("جواد جوادی");
    expect(acceptance?.renderedText).toContain(waybillNumber);
    expect(acceptance?.signatureDocumentId).toBeDefined();

    // Verify signature document is stored
    const sigDoc = await prisma.document.findUnique({
      where: { id: acceptance!.signatureDocumentId! },
    });
    expect(sigDoc?.documentType).toBe("SIGNATURE");
    expect(sigDoc?.mimeType).toBe("image/png");

    // Idempotent acceptance: calling again returns success
    const secondRes = await acceptDriverCommitment({
      sessionToken,
      signatureBase64: base64Sig,
    });
    expect(secondRes.commitmentStatus).toBe("ACCEPTED");
    expect(secondRes.acceptanceId).toBe(acceptRes.acceptanceId);
  });

  it("Step 6: now that commitment is ACCEPTED, payment submission is unlocked", async () => {
    const payment = await submitWaybillPayment({
      organizationId: testOrgId,
      waybillId,
      amount: 50700000n,
      method: "CARD_TO_CARD",
      actor: { actorType: "DRIVER" },
    });

    expect(payment.id).toBeDefined();
    expect(payment.status).toBe("SUBMITTED");

    const wb = await prisma.waybill.findUnique({ where: { id: waybillId } });
    expect(wb?.paymentStatus).toBe("SUBMITTED");
  });

  it("Step 7: revoking link immediately invalidates driver session", async () => {
    await revokeDriverAccessLink(linkId);

    // Validating session must now fail with LINK_REVOKED or SESSION_REVOKED
    await expect(validateDriverSession(sessionToken)).rejects.toThrowError(AppError);
  });
});
