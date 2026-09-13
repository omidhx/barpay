import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { getDashboardSummary } from "@/modules/reports/reporting-service";
import { deriveWaybillPhase } from "@/lib/waybills/phase";

describe("Phase 7 — High Concurrency & Acceptance Tests (PostgreSQL 16)", () => {
  let orgId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: `سازمان تست پذیرش بار ${Date.now()}`,
        slug: `load-org-${Date.now()}`,
        settings: {
          create: {
            smsDailyCap: 5000,
            roundMultiple: BigInt(50000),
            surchargeAmount: BigInt(700000),
          },
        },
      },
    });
    orgId = org.id;
  });

  afterAll(async () => {
    if (orgId) {
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
    }
  });

  it("handles 50 concurrent driver access sessions without race conditions or deadlocks", async () => {
    // 1. Create 50 distinct waybills
    const count = 50;
    const waybillPromises = Array.from({ length: count }, (_, i) =>
      prisma.waybill.create({
        data: {
          organizationId: orgId,
          waybillNumber: `WB-CONC-${Date.now()}-${i}`,
          driverNameRaw: `راننده هم‌زمان ${i}`,
          driverMobileRaw: `0912111${String(i).padStart(4, "0")}`,
          issueDate: new Date(),
          shipmentStatus: "READY_FOR_DRIVER",
          documentStatus: "VERIFIED",
          commitmentStatus: "PENDING",
          paymentStatus: "NOT_SUBMITTED",
          releaseStatus: "BLOCKED",
        },
      })
    );

    const waybills = await Promise.all(waybillPromises);
    expect(waybills.length).toBe(50);

    // 2. Simulate 50 concurrent access link generations and token hashes
    const linkPromises = waybills.map((wb, i) =>
      prisma.driverAccessLink.create({
        data: {
          organizationId: orgId,
          waybillId: wb.id,
          tokenHash: `hash-token-conc-${Date.now()}-${i}`,
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        },
      })
    );

    const links = await Promise.all(linkPromises);
    expect(links.length).toBe(50);

    // 3. Simulate 50 concurrent driver OTP requests
    const otpPromises = waybills.map((wb, i) =>
      prisma.otpChallenge.create({
        data: {
          organizationId: orgId,
          waybillId: wb.id,
          mobile: wb.driverMobileRaw,
          codeHash: `otp-hash-${i}`,
          expiresAt: new Date(Date.now() + 3 * 60 * 1000),
        },
      })
    );

    const otps = await Promise.all(otpPromises);
    expect(otps.length).toBe(50);

    // 4. Verify that dashboard query runs concurrently under load
    const concurrentDashboardQueries = Array.from({ length: 10 }, () =>
      getDashboardSummary(orgId)
    );

    const summaries = await Promise.all(concurrentDashboardQueries);
    for (const summary of summaries) {
      expect(summary.kpis.totalWaybills).toBeGreaterThanOrEqual(50);
      expect(summary.phases.AWAITING_COMMITMENT).toBe(0); // shipmentStatus is READY_FOR_DRIVER, so PDF_ATTACHED
      expect(summary.phases.PDF_ATTACHED).toBeGreaterThanOrEqual(50);
    }
  });

  it("handles 200 records batch processing without violating physical constraints", async () => {
    const batchSize = 200;
    const records = Array.from({ length: batchSize }, (_, i) => ({
      organizationId: orgId,
      waybillNumber: `WB-200-${Date.now()}-${i}`,
      driverNameRaw: `راننده دسته ۲۰۰تایی ${i}`,
      driverMobileRaw: `0912222${String(i).padStart(4, "0")}`,
      issueDate: new Date(),
      shipmentStatus: "IMPORTED" as const,
      documentStatus: "NOT_UPLOADED" as const,
      commitmentStatus: "NOT_REQUIRED" as const,
      paymentStatus: "NOT_REQUIRED" as const,
      releaseStatus: "BLOCKED" as const,
    }));

    // Insert 200 waybills in parallel chunks
    const chunkSize = 50;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      await prisma.waybill.createMany({
        data: chunk,
      });
    }

    const totalInOrg = await prisma.waybill.count({
      where: { organizationId: orgId },
    });

    // 50 from previous test + 200 from this test = 250
    expect(totalInOrg).toBeGreaterThanOrEqual(250);

    // Verify all 200 are derived as IMPORTED phase
    const sampleWaybills = await prisma.waybill.findMany({
      where: {
        organizationId: orgId,
        waybillNumber: { startsWith: `WB-200-` },
      },
      select: {
        shipmentStatus: true,
        documentStatus: true,
        paymentStatus: true,
        commitmentStatus: true,
        releaseStatus: true,
      },
      take: 200,
    });

    expect(sampleWaybills.length).toBe(200);
    for (const wb of sampleWaybills) {
      const phase = deriveWaybillPhase(wb);
      expect(phase).toBe("IMPORTED");
    }
  });
});
