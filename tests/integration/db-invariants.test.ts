import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";

describe("Database Physical Invariants & Triggers (PostgreSQL 16) — data-model.md §4 & invariants.md", () => {
  let testOrgId: string;

  beforeAll(async () => {
    // Create a dedicated test organization
    const org = await prisma.organization.create({
      data: {
        name: "شرکت ترابری آزمایشی فاز ۲",
        slug: `test-org-${Date.now()}`,
      },
    });
    testOrgId = org.id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testOrgId) {
      await prisma.organization.delete({
        where: { id: testOrgId },
      });
    }
    await prisma.$disconnect();
  });

  it("I-1: enforces CHECK check_waybills_release_invariants (cannot release without verified docs, accepted commitment, and approved payment)", async () => {
    // Attempt to insert an unauthorized RELEASED waybill directly via SQL
    await expect(
      prisma.$executeRaw`
        INSERT INTO "waybills" (
          "id", "organization_id", "waybill_number", "driver_name_raw", "driver_mobile_raw",
          "issue_date", "shipment_status", "document_status", "payment_status",
          "commitment_status", "release_status", "updated_at"
        ) VALUES (
          gen_random_uuid(), ${testOrgId}, 'WB-INV-1', 'علی راننده', '09121112233',
          NOW(), 'IMPORTED', 'NOT_UPLOADED', 'NOT_SUBMITTED', 'PENDING', 'RELEASED', NOW()
        )
      `
    ).rejects.toThrow(/check_waybills_release_invariants/i);
  });

  it("I-2: enforces CHECK check_waybills_cancelled_release (cancelled waybill can never be RELEASED)", async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "waybills" (
          "id", "organization_id", "waybill_number", "driver_name_raw", "driver_mobile_raw",
          "issue_date", "shipment_status", "document_status", "payment_status",
          "commitment_status", "release_status", "updated_at"
        ) VALUES (
          gen_random_uuid(), ${testOrgId}, 'WB-INV-2', 'رضا راننده', '09121112244',
          NOW(), 'CANCELLED', 'VERIFIED', 'APPROVED', 'ACCEPTED', 'RELEASED', NOW()
        )
      `
    ).rejects.toThrow(/check_waybills_cancelled_release/i);
  });

  it("I-3: enforces Partial Unique Index idx_waybill_amounts_current (only one current amount per waybill)", async () => {
    // Create valid waybill
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: testOrgId,
        waybillNumber: "WB-AMOUNT-1",
        driverNameRaw: "حسن راننده",
        driverMobileRaw: "09121112255",
        issueDate: new Date(),
      },
    });

    // First amount with is_current = true
    await prisma.waybillAmount.create({
      data: {
        organizationId: testOrgId,
        waybillId: waybill.id,
        rawExcelAmount: 10_000_000n,
        roundedAmount: 10_000_000n,
        surchargeAmount: 700_000n,
        amount: 10_700_000n,
        isCurrent: true,
      },
    });

    // Attempting a second is_current = true amount must fail via Partial Unique Index
    await expect(
      prisma.waybillAmount.create({
        data: {
          organizationId: testOrgId,
          waybillId: waybill.id,
          rawExcelAmount: 12_000_000n,
          roundedAmount: 12_000_000n,
          surchargeAmount: 700_000n,
          amount: 12_700_000n,
          isCurrent: true,
        },
      })
    ).rejects.toThrow();
  });

  it("I-8: enforces Partial Unique Index idx_payment_gateways_active_per_org (at most 1 active gateway per org)", async () => {
    await prisma.paymentGateway.create({
      data: {
        organizationId: testOrgId,
        provider: "ZARINPAL",
        credentialsJson: { apiKey: "test-key-1" },
        isActive: true,
      },
    });

    // Second active gateway in same org must fail
    await expect(
      prisma.paymentGateway.create({
        data: {
          organizationId: testOrgId,
          provider: "SEP",
          credentialsJson: { apiKey: "test-key-2" },
          isActive: true,
        },
      })
    ).rejects.toThrow();
  });

  it("I-10: enforces Trigger check_refund_ceiling (refund cannot exceed approved payments)", async () => {
    // Create waybill
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: testOrgId,
        waybillNumber: "WB-REFUND-1",
        driverNameRaw: "تقی راننده",
        driverMobileRaw: "09121112266",
        issueDate: new Date(),
      },
    });

    // Create amount
    const amount = await prisma.waybillAmount.create({
      data: {
        organizationId: testOrgId,
        waybillId: waybill.id,
        rawExcelAmount: 5_000_000n,
        roundedAmount: 5_000_000n,
        surchargeAmount: 0n,
        amount: 5_000_000n,
        isCurrent: true,
      },
    });

    // Approved payment of 5,000,000 Rials
    await prisma.payment.create({
      data: {
        organizationId: testOrgId,
        waybillId: waybill.id,
        waybillAmountId: amount.id,
        method: "POS",
        amount: 5_000_000n,
        status: "APPROVED",
      },
    });

    // Attempt refund of 6,000,000 Rials (exceeds 5M)
    await expect(
      prisma.paymentRefund.create({
        data: {
          organizationId: testOrgId,
          waybillId: waybill.id,
          amount: 6_000_000n,
          reason: "استرداد اضافه واریزی راننده",
          recordedBy: "admin",
        },
      })
    ).rejects.toThrow(/REFUND_CEILING_EXCEEDED/i);
  });

  it("I-11: enforces Trigger waybill_identity_immutable (waybill_number is immutable)", async () => {
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: testOrgId,
        waybillNumber: "WB-IMMUTABLE-1",
        waybillYear: 1403,
        driverNameRaw: "جواد راننده",
        driverMobileRaw: "09121112277",
        issueDate: new Date(),
      },
    });

    // Updating waybill_number must fail via trigger
    await expect(
      prisma.$executeRaw`
        UPDATE "waybills"
        SET "waybill_number" = 'WB-MODIFIED-NUMBER'
        WHERE "id" = ${waybill.id}
      `
    ).rejects.toThrow(/WAYBILL_IDENTITY_IMMUTABLE/i);
  });

  it("I-13: enforces Trigger commitment_version_immutable (template body cannot be updated in-place)", async () => {
    const version = await prisma.commitmentVersion.create({
      data: {
        organizationId: testOrgId,
        title: "تعهدنامه راننده نسخه ۱",
        templateKey: "STANDARD_TRUCK",
        variablesJson: { driverName: "string" },
        body: "متن اولیه تعهدنامه...",
        contentHash: "hash-initial-12345",
        status: "ACTIVE",
      },
    });

    // Modifying body directly must fail
    await expect(
      prisma.$executeRaw`
        UPDATE "commitment_versions"
        SET "body" = 'متن تغییریافته تعهدنامه...'
        WHERE "id" = ${version.id}
      `
    ).rejects.toThrow(/COMMITMENT_VERSION_IMMUTABLE/i);
  });

  it("Generated Column waybill_year_key: calculates COALESCE(waybill_year, 0) automatically in PostgreSQL", async () => {
    // 1. Waybill with explicit year 1403
    const wb1 = await prisma.waybill.create({
      data: {
        organizationId: testOrgId,
        waybillNumber: "WB-YEAR-1403",
        waybillYear: 1403,
        driverNameRaw: "سعید راننده",
        driverMobileRaw: "09121112288",
        issueDate: new Date(),
      },
    });

    const [row1] = await prisma.$queryRaw<Array<{ waybill_year_key: number }>>`
      SELECT waybill_year_key FROM "waybills" WHERE id = ${wb1.id}
    `;
    expect(row1.waybill_year_key).toBe(1403);

    // 2. Waybill with NULL year
    const wb2 = await prisma.waybill.create({
      data: {
        organizationId: testOrgId,
        waybillNumber: "WB-YEAR-NULL",
        waybillYear: null,
        driverNameRaw: "مهدی راننده",
        driverMobileRaw: "09121112299",
        issueDate: new Date(),
      },
    });

    const [row2] = await prisma.$queryRaw<Array<{ waybill_year_key: number }>>`
      SELECT waybill_year_key FROM "waybills" WHERE id = ${wb2.id}
    `;
    expect(row2.waybill_year_key).toBe(0);
  });
});
