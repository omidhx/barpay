import { prisma } from "@/lib/db/client";
import { DocumentStatus, PaymentStatus, CommitmentStatus, ReleaseStatus, ShipmentStatus } from "@prisma/client";
import { AppError } from "@/lib/errors/exceptions";
import { createAuditLogEntry } from "@/lib/audit/audit-logger";

export interface ReleaseConditionsInput {
  shipmentStatus: ShipmentStatus;
  documentStatus: DocumentStatus;
  paymentStatus: PaymentStatus;
  commitmentStatus: CommitmentStatus;
  releaseStatus: ReleaseStatus;
  hasActiveSession?: boolean;
}

export interface ReleaseEvaluationResult {
  canRelease: boolean;
  unmetConditions: string[];
}

/**
 * Pure evaluation function for release authorization conditions.
 * Follows state-transitions.md §5 and invariants.md I-1, I-2.
 * THE single source of truth for release eligibility.
 */
export function evaluateReleaseConditions(input: ReleaseConditionsInput): ReleaseEvaluationResult {
  const unmetConditions: string[] = [];

  // 1. Record must be active (not cancelled or archived) - Invariant I-2
  if (input.shipmentStatus === "CANCELLED" || input.shipmentStatus === "ARCHIVED") {
    unmetConditions.push("WAYBILL_NOT_ACTIVE");
  }

  // 2. Verified PDF attached
  if (input.documentStatus !== "VERIFIED") {
    unmetConditions.push("DOCUMENT_NOT_VERIFIED");
  }

  // 3. Payment fully settled or not required (no residual due)
  if (!["APPROVED", "NOT_REQUIRED"].includes(input.paymentStatus)) {
    unmetConditions.push("PAYMENT_NOT_SETTLED");
  }

  // 4. Commitment accepted or not required - Invariant I-14
  if (!["ACCEPTED", "NOT_REQUIRED"].includes(input.commitmentStatus)) {
    unmetConditions.push("COMMITMENT_NOT_ACCEPTED");
  }

  // 5. Release authorized or released
  if (!["AUTHORIZED", "RELEASED"].includes(input.releaseStatus)) {
    unmetConditions.push("RELEASE_NOT_AUTHORIZED");
  }

  // 6. Valid session check if supplied
  if (input.hasActiveSession === false) {
    unmetConditions.push("UNAUTHORIZED_SESSION");
  }

  return {
    canRelease: unmetConditions.length === 0,
    unmetConditions,
  };
}

export interface AuthorizeReleaseInput {
  organizationId: string;
  waybillId: string;
  authorizedBy: string;
  expiresAt?: Date;
  actor: {
    actorType: "USER" | "SYSTEM";
    actorId: string;
    ip?: string | null;
    userAgent?: string | null;
    correlationId?: string | null;
  };
}

export interface RevokeReleaseInput {
  organizationId: string;
  waybillId: string;
  revokedBy: string;
  revokeReason: string;
  actor: {
    actorType: "USER" | "SYSTEM";
    actorId: string;
    ip?: string | null;
    userAgent?: string | null;
    correlationId?: string | null;
  };
}

/**
 * Grants release authorization for a waybill.
 * Transitions release_status from ELIGIBLE to AUTHORIZED.
 * Enforces Invariant I-5: at most one active authorization via idx_release_authorizations_active.
 */
export async function authorizeRelease(input: AuthorizeReleaseInput) {
  const { organizationId, waybillId, authorizedBy, expiresAt, actor } = input;

  return prisma.$transaction(async (tx) => {
    const waybill = await tx.waybill.findFirst({
      where: { id: waybillId, organizationId },
    });

    if (!waybill) {
      throw new AppError("NOT_FOUND", "بارنامه مورد نظر یافت نشد.");
    }

    if (waybill.shipmentStatus === "CANCELLED" || waybill.shipmentStatus === "ARCHIVED") {
      throw new AppError("WAYBILL_NOT_ACTIVE", "بارنامه باطل یا بایگانی شده است.");
    }

    // Invariant I-1 check: Payment APPROVED/NOT_REQUIRED, Commitment ACCEPTED/NOT_REQUIRED, Doc VERIFIED
    const isDocVerified = waybill.documentStatus === "VERIFIED";
    const isPaymentApproved = ["APPROVED", "NOT_REQUIRED"].includes(waybill.paymentStatus);
    const isCommitmentAccepted = ["ACCEPTED", "NOT_REQUIRED"].includes(waybill.commitmentStatus);

    if (!isDocVerified || !isPaymentApproved || !isCommitmentAccepted) {
      throw new AppError(
        "INVALID_TRANSITION",
        "پیش‌شرط‌های آزادسازی بارنامه (پرداخت، تعهدنامه و فایل سند) هنوز کامل نشده‌اند."
      );
    }

    // Check if already authorized
    const existingActive = await tx.releaseAuthorization.findFirst({
      where: { waybillId, revokedAt: null },
    });

    if (existingActive) {
      return { success: true, idempotent: true, authorization: existingActive };
    }

    // Create authorization record (unique partial index idx_release_authorizations_active guarantees singleton)
    const authorization = await tx.releaseAuthorization.create({
      data: {
        organizationId,
        waybillId,
        authorizedBy,
        expiresAt,
      },
    });

    // Update waybill release_status to AUTHORIZED
    await tx.waybill.update({
      where: { id: waybillId },
      data: {
        releaseStatus: "AUTHORIZED",
        version: { increment: 1 },
      },
    });

    // Audit log
    await createAuditLogEntry(tx, {
      organizationId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "RELEASE_AUTHORIZED",
      entityType: "RELEASE_AUTHORIZATION",
      entityId: authorization.id,
      beforeJson: { releaseStatus: waybill.releaseStatus },
      afterJson: {
        releaseStatus: "AUTHORIZED",
        authorizedBy,
        expiresAt: expiresAt?.toISOString(),
      },
      correlationId: actor.correlationId,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return { success: true, idempotent: false, authorization };
  });
}

/**
 * Revokes release authorization for a waybill.
 * Transitions release_status to REVOKED and terminates active driver sessions immediately.
 */
export async function revokeRelease(input: RevokeReleaseInput) {
  const { organizationId, waybillId, revokedBy, revokeReason, actor } = input;

  if (!revokeReason || revokeReason.trim().length === 0) {
    throw new AppError("VALIDATION_ERROR", "درج دلیل برای لغو مجوز آزادسازی الزامی است.");
  }

  return prisma.$transaction(async (tx) => {
    const waybill = await tx.waybill.findFirst({
      where: { id: waybillId, organizationId },
    });

    if (!waybill) {
      throw new AppError("NOT_FOUND", "بارنامه مورد نظر یافت نشد.");
    }

    // Revoke active authorization
    const activeAuth = await tx.releaseAuthorization.findFirst({
      where: { waybillId, revokedAt: null },
    });

    if (activeAuth) {
      await tx.releaseAuthorization.update({
        where: { id: activeAuth.id },
        data: {
          revokedAt: new Date(),
          revokedBy,
          revokeReason: revokeReason.trim(),
        },
      });
    }

    // Immediately revoke all active driver sessions for this waybill (master-spec §6.3 line 861)
    await tx.driverSession.updateMany({
      where: {
        waybillId,
        organizationId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    // Update waybill release_status to REVOKED
    await tx.waybill.update({
      where: { id: waybillId },
      data: {
        releaseStatus: "REVOKED",
        version: { increment: 1 },
      },
    });

    // Audit log
    await createAuditLogEntry(tx, {
      organizationId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "RELEASE_REVOKED",
      entityType: "WAYBILL",
      entityId: waybillId,
      beforeJson: { releaseStatus: waybill.releaseStatus },
      afterJson: {
        releaseStatus: "REVOKED",
        revokedBy,
        revokeReason: revokeReason.trim(),
      },
      correlationId: actor.correlationId,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return { success: true };
  });
}

export interface VerifyAndGrantDownloadInput {
  organizationId: string;
  waybillId: string;
  driverSessionId?: string;
  ip?: string;
  userAgent?: string;
}

export interface GrantDownloadResult {
  granted: boolean;
  unmetConditions: string[];
  document?: {
    id: string;
    storageKey: string;
    sha256Hash: string;
    mimeType: string;
  };
}

/**
 * Atomic download check & grant function (closing TOCTOU).
 * Evaluates conditions, validates PDF, writes access event, and transitions to RELEASED in ONE transaction.
 */
export async function canReleaseAndGrantDownload(
  input: VerifyAndGrantDownloadInput
): Promise<GrantDownloadResult> {
  const { organizationId, waybillId, driverSessionId, ip, userAgent } = input;

  return prisma.$transaction(async (tx) => {
    // 1. Fetch waybill
    const waybill = await tx.waybill.findFirst({
      where: { id: waybillId, organizationId },
      include: {
        documents: {
          where: {
            documentType: "WAYBILL_PDF",
            matchingStatus: { not: "REPLACED" },
          },
          take: 1,
        },
      },
    });

    if (!waybill) {
      return {
        granted: false,
        unmetConditions: ["NOT_FOUND"],
      };
    }

    // 2. Validate session if driver session ID provided
    let hasActiveSession = true;
    if (driverSessionId) {
      const session = await tx.driverSession.findFirst({
        where: {
          id: driverSessionId,
          waybillId,
          organizationId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!session) {
        hasActiveSession = false;
      }
    }

    // 3. Evaluate release rules
    const evaluation = evaluateReleaseConditions({
      shipmentStatus: waybill.shipmentStatus,
      documentStatus: waybill.documentStatus,
      paymentStatus: waybill.paymentStatus,
      commitmentStatus: waybill.commitmentStatus,
      releaseStatus: waybill.releaseStatus,
      hasActiveSession,
    });

    if (!evaluation.canRelease) {
      return {
        granted: false,
        unmetConditions: evaluation.unmetConditions,
      };
    }

    const pdfDoc = waybill.documents[0];
    if (!pdfDoc) {
      return {
        granted: false,
        unmetConditions: ["DOCUMENT_NOT_FOUND"],
      };
    }

    // 4. Record access event atomically
    await tx.documentAccessEvent.create({
      data: {
        organizationId,
        waybillId,
        documentId: pdfDoc.id,
        driverSessionId,
        accessType: "DOWNLOAD",
        ip,
        userAgent,
      },
    });

    // 5. If releaseStatus was AUTHORIZED, advance to RELEASED
    if (waybill.releaseStatus === "AUTHORIZED") {
      await tx.waybill.update({
        where: { id: waybillId },
        data: {
          releaseStatus: "RELEASED",
          version: { increment: 1 },
        },
      });
    }

    return {
      granted: true,
      unmetConditions: [],
      document: {
        id: pdfDoc.id,
        storageKey: pdfDoc.storageKey,
        sha256Hash: pdfDoc.sha256Hash,
        mimeType: pdfDoc.mimeType,
      },
    };
  });
}
