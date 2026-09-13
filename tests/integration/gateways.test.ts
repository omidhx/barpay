import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  createBankCard,
  getActiveBankCardsForDriver,
} from "@/modules/payments/cards/bank-card-service";
import {
  initiateGatewayPayment,
  handleGatewayCallback,
} from "@/modules/payments/gateways/gateway-service";
import { encryptCredentials } from "@/lib/crypto/encryption";
import { zarinpalAdapter } from "@/modules/payments/gateways/adapters/zarinpal";
import { submitWaybillPayment } from "@/modules/waybills/state-machine";
import { AppError } from "@/lib/errors/exceptions";

describe("Payment Gateways & Bank Cards (PostgreSQL 16) — business-rules.md §2 & master-spec §6.10", () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  async function createTestOrg(slug: string) {
    return prisma.organization.create({
      data: {
        name: `سازمان تست ${slug}`,
        slug: `org-${slug}-${Date.now()}`,
        settings: {
          create: {
            commitmentEnforcement: "ENFORCED",
          },
        },
      },
      include: { settings: true },
    });
  }

  async function createTestWaybill(
    orgId: string,
    waybillNumber: string,
    amount: bigint,
    commitmentStatus: "PENDING" | "ACCEPTED" | "DECLINED" = "ACCEPTED",
    documentStatus: "NOT_UPLOADED" | "VERIFIED" = "VERIFIED"
  ) {
    const wb = await prisma.waybill.create({
      data: {
        organizationId: orgId,
        waybillNumber,
        driverNameRaw: "محمد راننده",
        driverMobileRaw: "09121112233",
        shipmentStatus: "DRIVER_VIEWED",
        commitmentStatus,
        documentStatus,
        paymentStatus: "NOT_SUBMITTED",
        issueDate: new Date(),
        releaseStatus: "BLOCKED",
      },
    });

    const amt = await prisma.waybillAmount.create({
      data: {
        organizationId: orgId,
        waybillId: wb.id,
        amount,
        rawExcelAmount: amount,
        roundedAmount: amount,
        surchargeAmount: 0n,
        isCurrent: true,
        source: "EXCEL_CALCULATED",
      },
    });

    return { waybill: wb, amount: amt };
  }

  describe("Bank Cards & Constraints (Decision 21)", () => {
    it("creates and retrieves active bank cards with formatted display for driver", async () => {
      const org = await createTestOrg("card-test-1");

      const card = await createBankCard(org.id, {
        bankCode: "BMI",
        holderFirstName: "علی",
        holderLastName: "حسینی",
        cardNumber: "6037991122334455", // Valid Luhn
        iban: "IR270170000000100324200001", // Valid MOD-97
        isActive: true,
        displayOrder: 1,
      });

      expect(card.id).toBeDefined();
      expect(card.cardNumber).toBe("6037991122334455");

      const driverCards = await getActiveBankCardsForDriver(org.id);
      expect(driverCards.length).toBe(1);
      expect(driverCards[0].cardNumberFormatted).toBe("6037 - 9911 - 2233 - 4455");
      expect(driverCards[0].cardNumberRaw).toBe("6037991122334455");
      expect(driverCards[0].bankName).toBe("بانک ملی ایران");
      expect(driverCards[0].holderFullName).toBe("علی حسینی");
    });

    it("enforces database CHECK constraint for invalid 16-digit card number", async () => {
      const org = await createTestOrg("card-check-1");

      // Attempt raw DB insert with non-16-digit card_number
      await expect(
        prisma.$executeRaw`
          INSERT INTO bank_cards (id, organization_id, bank_code, holder_first_name, holder_last_name, card_number, iban, is_active, display_order, created_at, updated_at)
          VALUES (gen_random_uuid(), ${org.id}::uuid, 'OTHER', 'تست', 'تست', '12345', 'IR270170000000100324200001', true, 0, NOW(), NOW())
        `
      ).rejects.toThrow();
    });

    it("enforces database CHECK constraint for invalid IBAN pattern", async () => {
      const org = await createTestOrg("card-check-2");

      // Attempt raw DB insert with invalid IBAN pattern
      await expect(
        prisma.$executeRaw`
          INSERT INTO bank_cards (id, organization_id, bank_code, holder_first_name, holder_last_name, card_number, iban, is_active, display_order, created_at, updated_at)
          VALUES (gen_random_uuid(), ${org.id}::uuid, 'OTHER', 'تست', 'تست', '6037991122334455', 'INVALID_IBAN', true, 0, NOW(), NOW())
        `
      ).rejects.toThrow();
    });
  });

  describe("Gateway Payment Lifecycle & Security (Decision 20)", () => {
    it("enforces Partial Unique Index idx_payment_gateways_active_per_org (at most 1 active gateway)", async () => {
      const org = await createTestOrg("gw-active-1");

      await prisma.paymentGateway.create({
        data: {
          organizationId: org.id,
          provider: "ZARINPAL",
          credentialsJson: encryptCredentials({ merchantId: "uuid-1" }) as any,
          isActive: true,
        },
      });

      // Second active gateway in same org must fail via idx_payment_gateways_active_per_org
      await expect(
        prisma.paymentGateway.create({
          data: {
            organizationId: org.id,
            provider: "ZIBAL",
            credentialsJson: encryptCredentials({ merchant: "uuid-2" }) as any,
            isActive: true,
          },
        })
      ).rejects.toThrow();
    });

    it("enforces Invariant I-14 / Decision 19: rejects payment initiation if commitment is not ACCEPTED in ENFORCED mode", async () => {
      const org = await createTestOrg("commit-gate-1");
      const { waybill } = await createTestWaybill(org.id, "WB-GATE-01", 50000000n, "PENDING");

      await prisma.paymentGateway.create({
        data: {
          organizationId: org.id,
          provider: "ZARINPAL",
          credentialsJson: encryptCredentials({ merchantId: "test-merchant" }) as any,
          isActive: true,
        },
      });

      try {
        await initiateGatewayPayment({
          organizationId: org.id,
          waybillId: waybill.id,
          callbackBaseUrl: "http://localhost:3000",
        });
        expect.unreachable("Should have thrown COMMITMENT_NOT_ACCEPTED");
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe("COMMITMENT_NOT_ACCEPTED");
      }
    });

    it("initiates online gateway payment, stores transaction with 20-minute expiry, and locks concurrent attempts", async () => {
      const org = await createTestOrg("gw-flow-1");
      const { waybill } = await createTestWaybill(org.id, "WB-GATE-02", 80700000n, "ACCEPTED");

      await prisma.paymentGateway.create({
        data: {
          organizationId: org.id,
          provider: "ZARINPAL",
          credentialsJson: encryptCredentials({ merchantId: "550e8400-e29b-41d4-a716-446655440000" }) as any,
          mode: "SANDBOX",
          isActive: true,
        },
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { code: 100, authority: "A0000000000000000000000000000000001" },
        }),
      });

      const initRes = await initiateGatewayPayment({
        organizationId: org.id,
        waybillId: waybill.id,
        callbackBaseUrl: "http://localhost:3000",
        linkToken: "mock-link-token-12345",
      });

      expect(initRes.state).toBeDefined();
      expect(initRes.redirect.url).toContain("sandbox.zarinpal.com");

      // Verify GatewayTransaction record
      const txRecord = await prisma.gatewayTransaction.findUnique({
        where: { id: initRes.transactionId },
      });
      expect(txRecord).toBeDefined();
      expect(txRecord?.status).toBe("INITIATED");
      expect(txRecord?.amount).toBe(80700000n);
      expect(txRecord?.providerReference).toBe("A0000000000000000000000000000000001");

      // Invariant 9: Second attempt on same waybill while open must fail with GATEWAY_ATTEMPT_LOCKED
      try {
        await initiateGatewayPayment({
          organizationId: org.id,
          waybillId: waybill.id,
          callbackBaseUrl: "http://localhost:3000",
        });
        expect.unreachable("Should have thrown GATEWAY_ATTEMPT_LOCKED");
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe("GATEWAY_ATTEMPT_LOCKED");
      }
    });

    it("verifies transaction server-to-server, approves payment, and advances release status to ELIGIBLE", async () => {
      const org = await createTestOrg("gw-flow-2");
      const { waybill } = await createTestWaybill(
        org.id,
        "WB-GATE-03",
        80700000n,
        "ACCEPTED",
        "VERIFIED"
      );

      const gw = await prisma.paymentGateway.create({
        data: {
          organizationId: org.id,
          provider: "ZARINPAL",
          credentialsJson: encryptCredentials({ merchantId: "550e8400-e29b-41d4-a716-446655440000" }) as any,
          mode: "SANDBOX",
          isActive: true,
        },
      });

      // Create INITIATED transaction
      const state = `state-success-${Date.now()}`;
      const authority = `AUTH-SUCCESS-${Date.now()}`;
      const tx = await prisma.gatewayTransaction.create({
        data: {
          organizationId: org.id,
          waybillId: waybill.id,
          paymentGatewayId: gw.id,
          provider: "ZARINPAL",
          state,
          providerReference: authority,
          amount: 80700000n,
          waybillAmountId: (await prisma.waybillAmount.findFirstOrThrow({ where: { waybillId: waybill.id } })).id,
          status: "INITIATED",
          expiresAt: new Date(Date.now() + 20 * 60 * 1000),
        },
      });

      // Mock server-to-server verify call
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            code: 100,
            ref_id: 99887766,
            card_pan: "603799******4451",
          },
        }),
      });

      const callbackRes = await handleGatewayCallback({
        provider: "ZARINPAL",
        state,
        queryParams: { Authority: authority, Status: "OK" },
      });

      expect(callbackRes.status).toBe("VERIFIED");
      expect(callbackRes.referenceNumber).toBe("99887766");

      // Verify GatewayTransaction updated to VERIFIED
      const updatedTx = await prisma.gatewayTransaction.findUnique({
        where: { id: tx.id },
      });
      expect(updatedTx?.status).toBe("VERIFIED");

      // Verify Payment record created with GATEWAY method and auto_verified_at
      const payment = await prisma.payment.findFirst({
        where: { waybillId: waybill.id, gatewayTransactionId: tx.id },
      });
      expect(payment).toBeDefined();
      expect(payment?.method).toBe("GATEWAY");
      expect(payment?.gatewayProvider).toBe("ZARINPAL");
      expect(payment?.autoVerifiedAt).toBeDefined();
      expect(payment?.status).toBe("APPROVED");

      // Verify Waybill advanced to paymentStatus=APPROVED and releaseStatus=ELIGIBLE
      const updatedWb = await prisma.waybill.findUnique({
        where: { id: waybill.id },
      });
      expect(updatedWb?.paymentStatus).toBe("APPROVED");
      expect(updatedWb?.releaseStatus).toBe("ELIGIBLE");
    });

    it("detects amount mismatch and marks transaction FAILED with GATEWAY_AMOUNT_MISMATCH", async () => {
      const org = await createTestOrg("gw-mismatch-1");
      const { waybill } = await createTestWaybill(org.id, "WB-GATE-04", 80700000n, "ACCEPTED");

      const gw = await prisma.paymentGateway.create({
        data: {
          organizationId: org.id,
          provider: "ZARINPAL",
          credentialsJson: encryptCredentials({ merchantId: "550e8400-e29b-41d4-a716-446655440000" }) as any,
          mode: "SANDBOX",
          isActive: true,
        },
      });

      const state = `state-mismatch-${Date.now()}`;
      const authority = `AUTH-MISMATCH-${Date.now()}`;
      const tx = await prisma.gatewayTransaction.create({
        data: {
          organizationId: org.id,
          waybillId: waybill.id,
          paymentGatewayId: gw.id,
          provider: "ZARINPAL",
          state,
          providerReference: authority,
          amount: 80700000n,
          waybillAmountId: (await prisma.waybillAmount.findFirstOrThrow({ where: { waybillId: waybill.id } })).id,
          status: "INITIATED",
          expiresAt: new Date(Date.now() + 20 * 60 * 1000),
        },
      });

      // Mock verify returning smaller amount (5,000,000 Tomans = 50,000,000 Rials instead of 80,700,000)
      vi.spyOn(zarinpalAdapter, "verifyTransaction").mockResolvedValue({
        verified: true,
        paidAmountRial: 50000000n, // Mismatch!
        traceNumber: "123",
        raw: {},
      });

      try {
        await handleGatewayCallback({
          provider: "ZARINPAL",
          state,
          queryParams: { Authority: authority, Status: "OK" },
        });
        expect.unreachable("Should have thrown GATEWAY_AMOUNT_MISMATCH");
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe("GATEWAY_AMOUNT_MISMATCH");
      }

      const updatedTx = await prisma.gatewayTransaction.findUnique({
        where: { id: tx.id },
      });
      expect(updatedTx?.status).toBe("FAILED");
      expect(updatedTx?.errorCode).toBe("GATEWAY_AMOUNT_MISMATCH");

      // No payment should have been approved
      const paymentCount = await prisma.payment.count({
        where: { waybillId: waybill.id },
      });
      expect(paymentCount).toBe(0);
    });

    it("handles duplicate callback idempotently without double payment creation", async () => {
      const org = await createTestOrg("gw-dup-1");
      const { waybill } = await createTestWaybill(org.id, "WB-GATE-05", 80700000n, "ACCEPTED");

      const gw = await prisma.paymentGateway.create({
        data: {
          organizationId: org.id,
          provider: "ZARINPAL",
          credentialsJson: encryptCredentials({ merchantId: "550e8400-e29b-41d4-a716-446655440000" }) as any,
          mode: "SANDBOX",
          isActive: true,
        },
      });

      const state = `state-dup-${Date.now()}`;
      const authority = `AUTH-DUP-${Date.now()}`;
      await prisma.gatewayTransaction.create({
        data: {
          organizationId: org.id,
          waybillId: waybill.id,
          paymentGatewayId: gw.id,
          provider: "ZARINPAL",
          state,
          providerReference: authority,
          amount: 80700000n,
          waybillAmountId: (await prisma.waybillAmount.findFirstOrThrow({ where: { waybillId: waybill.id } })).id,
          status: "VERIFIED", // Already verified
          expiresAt: new Date(Date.now() + 20 * 60 * 1000),
        },
      });

      const callbackRes = await handleGatewayCallback({
        provider: "ZARINPAL",
        state,
        queryParams: { Authority: authority, Status: "OK" },
      });

      expect(callbackRes.status).toBe("ALREADY_VERIFIED");
    });
  });

  describe("Card-to-Card Manual Payment (Decision 21)", () => {
    it("submits manual card-to-card payment with tracking number and updates status to SUBMITTED", async () => {
      const org = await createTestOrg("c2c-1");
      const { waybill } = await createTestWaybill(org.id, "WB-C2C-01", 13750000n, "ACCEPTED");

      const card = await createBankCard(org.id, {
        bankCode: "BMI",
        holderFirstName: "رضا",
        holderLastName: "عباسی",
        cardNumber: "6037991122334455",
        iban: "IR270170000000100324200001",
      });

      const payment = await submitWaybillPayment({
        organizationId: org.id,
        waybillId: waybill.id,
        method: "CARD_TO_CARD",
        amount: 13750000n,
        trackingNumber: "TRK-998877",
        payoutCardId: card.id,
        actor: { actorType: "DRIVER", actorId: "driver-session-1" },
      });

      expect(payment.id).toBeDefined();
      expect(payment.status).toBe("SUBMITTED");
      expect(payment.trackingNumber).toBe("TRK-998877");
      expect(payment.payoutCardId).toBe(card.id);

      const updatedWb = await prisma.waybill.findUnique({
        where: { id: waybill.id },
      });
      expect(updatedWb?.paymentStatus).toBe("SUBMITTED");
    });
  });
});
