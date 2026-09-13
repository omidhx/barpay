import { prisma } from "@/lib/db/client";
import { DocumentStatus, PaymentStatus, CommitmentStatus, ReleaseStatus, ShipmentStatus } from "@prisma/client";

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
 * Follows state-transitions.md §5.
 * THE single source of truth for release eligibility.
 */
export function evaluateReleaseConditions(input: ReleaseConditionsInput): ReleaseEvaluationResult {
  const unmetConditions: string[] = [];

  // 1. Record must be active (not cancelled or archived)
  if (input.shipmentStatus === "CANCELLED" || input.shipmentStatus === "ARCHIVED") {
    unmetConditions.push("WAYBILL_NOT_ACTIVE");
  }

  // 2. Verified PDF attached
  if (input.documentStatus !== "VERIFIED") {
    unmetConditions.push("DOCUMENT_NOT_VERIFIED");
  }

  // 3. Payment fully settled or not required
  if (!["APPROVED", "NOT_REQUIRED"].includes(input.paymentStatus)) {
    unmetConditions.push("PAYMENT_NOT_SETTLED");
  }

  // 4. Commitment accepted or not required
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
 * Atomic download check & grant function.
 * Evaluates conditions, validates PDF, and writes access event in ONE transaction (closing TOCTOU).
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
        data: { releaseStatus: "RELEASED" },
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
