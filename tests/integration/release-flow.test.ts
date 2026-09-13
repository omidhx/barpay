import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  authorizeRelease,
  revokeRelease,
  canReleaseAndGrantDownload,
} from "@/modules/delivery/release-service";
import { getStorageProvider } from "@/lib/storage";

describe("Document Release & Atomic Download Grant (PostgreSQL 16) — business-rules.md §7 & master-spec §6.7", () => {
  let orgId: string;
  let testStorageKey: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: `تست آزادسازی و دانلود ${Date.now()}`,
        slug: `release-org-${Date.now()}`,
      },
    });
    orgId = org.id;

    // Create a dummy PDF in storage for testing download grant
    testStorageKey = `waybills/test-release-${Date.now()}.pdf`;
    const dummyPdf = Buffer.from("%PDF-1.4 test release document");
    await getStorageProvider().put(testStorageKey, dummyPdf);
  });

  afterAll(async () => {
    await getStorageProvider().delete(testStorageKey).catch(() => {});
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  it("executes full release flow: ELIGIBLE -> AUTHORIZED -> atomic grant to RELEASED -> access event logged", async () => {
    // 1. Create waybill fully settled & verified
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: orgId,
        waybillNumber: `WB-REL-${Date.now()}`,
        driverNameRaw: "راننده آزادسازی",
        driverMobileRaw: "09121110030",
        issueDate: new Date(),
        shipmentStatus: "DRIVER_VIEWED",
        documentStatus: "VERIFIED",
        commitmentStatus: "ACCEPTED",
        paymentStatus: "APPROVED",
        releaseStatus: "ELIGIBLE",
      },
    });

    // Attach verified PDF document
    const doc = await prisma.document.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        documentType: "WAYBILL_PDF",
        storageKey: testStorageKey,
        mimeType: "application/pdf",
        fileSize: 1024,
        sha256Hash: "fakehash123",
        matchingStatus: "AUTO_MATCHED",
      },
    });

    // 2. Authorize release
    const authResult = await authorizeRelease({
      organizationId: orgId,
      waybillId: waybill.id,
      authorizedBy: "supervisor-1",
      actor: { actorType: "USER", actorId: "supervisor-1" },
    });

    expect(authResult.success).toBe(true);
    expect(authResult.authorization).toBeDefined();

    const waybillAfterAuth = await prisma.waybill.findUnique({ where: { id: waybill.id } });
    expect(waybillAfterAuth?.releaseStatus).toBe("AUTHORIZED");

    // 3. Enforces Invariant I-5: partial unique index idx_release_authorizations_active
    // Attempting raw DB insert of second active authorization on same waybill must fail
    await expect(
      prisma.releaseAuthorization.create({
        data: {
          organizationId: orgId,
          waybillId: waybill.id,
          authorizedBy: "supervisor-rogue",
        },
      })
    ).rejects.toThrow();

    // 4. Atomic grant download (TOCTOU protection)
    const grant = await canReleaseAndGrantDownload({
      organizationId: orgId,
      waybillId: waybill.id,
      ip: "127.0.0.1",
      userAgent: "Vitest Agent",
    });

    expect(grant.granted).toBe(true);
    expect(grant.document).toBeDefined();
    expect(grant.document?.id).toBe(doc.id);
    expect(grant.document?.storageKey).toBe(testStorageKey);

    // Waybill release_status transitioned from AUTHORIZED to RELEASED
    const waybillAfterDownload = await prisma.waybill.findUnique({ where: { id: waybill.id } });
    expect(waybillAfterDownload?.releaseStatus).toBe("RELEASED");

    // Document access event recorded
    const accessEvents = await prisma.documentAccessEvent.findMany({
      where: { waybillId: waybill.id },
    });
    expect(accessEvents.length).toBe(1);
    expect(accessEvents[0].documentId).toBe(doc.id);
    expect(accessEvents[0].accessType).toBe("DOWNLOAD");
  });

  it("revoking release terminates driver sessions and blocks subsequent downloads", async () => {
    const waybill = await prisma.waybill.create({
      data: {
        organizationId: orgId,
        waybillNumber: `WB-REVOKE-${Date.now()}`,
        driverNameRaw: "راننده لغو مجوز",
        driverMobileRaw: "09121110031",
        issueDate: new Date(),
        shipmentStatus: "DRIVER_VIEWED",
        documentStatus: "VERIFIED",
        commitmentStatus: "ACCEPTED",
        paymentStatus: "APPROVED",
        releaseStatus: "ELIGIBLE",
      },
    });

    await prisma.document.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        documentType: "WAYBILL_PDF",
        storageKey: testStorageKey,
        mimeType: "application/pdf",
        fileSize: 1024,
        sha256Hash: "fakehash456",
        matchingStatus: "AUTO_MATCHED",
      },
    });

    // Authorize release
    await authorizeRelease({
      organizationId: orgId,
      waybillId: waybill.id,
      authorizedBy: "supervisor-1",
      actor: { actorType: "USER", actorId: "supervisor-1" },
    });

    // Create a dummy link & driver session
    const link = await prisma.driverAccessLink.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        tokenHash: `test-token-hash-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    const session = await prisma.driverSession.create({
      data: {
        organizationId: orgId,
        waybillId: waybill.id,
        driverAccessLinkId: link.id,
        sessionTokenHash: `test-session-hash-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    // Revoke release
    const revokeResult = await revokeRelease({
      organizationId: orgId,
      waybillId: waybill.id,
      revokedBy: "supervisor-2",
      revokeReason: "اشتباه در تأیید مدارک اولیه بارنامه",
      actor: { actorType: "USER", actorId: "supervisor-2" },
    });

    expect(revokeResult.success).toBe(true);

    // Verify waybill status is REVOKED
    const waybillAfterRevoke = await prisma.waybill.findUnique({ where: { id: waybill.id } });
    expect(waybillAfterRevoke?.releaseStatus).toBe("REVOKED");

    // Verify session is revoked
    const sessionAfterRevoke = await prisma.driverSession.findUnique({ where: { id: session.id } });
    expect(sessionAfterRevoke?.revokedAt).not.toBeNull();

    // Verify subsequent download is blocked
    const downloadAttempt = await canReleaseAndGrantDownload({
      organizationId: orgId,
      waybillId: waybill.id,
      driverSessionId: session.id,
    });

    expect(downloadAttempt.granted).toBe(false);
    expect(downloadAttempt.unmetConditions).toContain("RELEASE_NOT_AUTHORIZED");
    expect(downloadAttempt.unmetConditions).toContain("UNAUTHORIZED_SESSION");
  });
});
