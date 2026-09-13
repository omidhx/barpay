import crypto from "crypto";
import { prisma } from "@/lib/db/client";
import { AppError } from "@/lib/errors/exceptions";
import { getStorageProvider } from "@/lib/storage";
import { createAuditLogEntry } from "@/lib/audit/audit-logger";
import { validateDriverSession } from "@/modules/auth/driver-auth";

export const PNG_MAGIC_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
export const MAX_SIGNATURE_SIZE_BYTES = 500 * 1024; // 500KB

/**
 * Replaces {{variable_name}} placeholders with provided values.
 * Throws TEMPLATE_VARIABLE_UNRESOLVED if any placeholder remains (business-rules.md §9).
 */
export function renderCommitmentText(
  templateBody: string,
  variables: Record<string, string>
): string {
  let rendered = templateBody;

  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    rendered = rendered.replace(pattern, value ?? "");
  }

  // Check for unresolved placeholders
  const unresolvedMatches = rendered.match(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g);
  if (unresolvedMatches && unresolvedMatches.length > 0) {
    const unresolvedNames = unresolvedMatches.map((m) =>
      m.replace(/[\{\}\s]/g, "")
    );
    throw new AppError(
      "TEMPLATE_VARIABLE_UNRESOLVED",
      `متغیرهای زیر در قالب تعهدنامه مقداردهی نشده‌اند: ${unresolvedNames.join("، ")}`
    );
  }

  return rendered;
}

/**
 * Validates drawing signature format (transparent PNG, <= 500KB, non-empty).
 */
export function validateSignatureBuffer(buffer: Buffer): void {
  if (buffer.length > MAX_SIGNATURE_SIZE_BYTES) {
    throw new AppError(
      "SIGNATURE_TOO_LARGE",
      `حجم تصویر امضا (${Math.round(buffer.length / 1024)}KB) بیش از سقف مجاز (۵۰۰KB) است.`
    );
  }

  if (buffer.length < 8) {
    throw new AppError(
      "INVALID_SIGNATURE_FORMAT",
      "فرمت تصویر امضا باید PNG معتبر باشد."
    );
  }

  const header = buffer.subarray(0, 8);
  if (!header.equals(PNG_MAGIC_BYTES)) {
    throw new AppError(
      "INVALID_SIGNATURE_FORMAT",
      "فرمت تصویر امضا باید PNG معتبر باشد."
    );
  }

  if (buffer.length < 100) {
    throw new AppError("SIGNATURE_EMPTY", "امضای ترسیمی خالی یا ناقص است.");
  }
}

export interface AcceptDriverCommitmentInput {
  sessionToken: string;
  signatureBase64: string;
  clientIp?: string;
  userAgent?: string;
}

export interface AcceptDriverCommitmentResult {
  acceptanceId: string;
  commitmentStatus: "ACCEPTED";
  contentHash: string;
  signedAt: Date;
}

/**
 * Accepts and signs the legal commitment (electronic declaration) with server-rendered text
 * and canvas signature. Follows Decision 19 & business-rules.md §9.
 */
export async function acceptDriverCommitment(
  input: AcceptDriverCommitmentInput
): Promise<AcceptDriverCommitmentResult> {
  const { sessionToken, signatureBase64, clientIp, userAgent } = input;

  // 1. Validate driver session
  const session = await validateDriverSession(sessionToken);
  const { organizationId, waybillId } = session;

  const waybill = await prisma.waybill.findUnique({
    where: { id: waybillId },
    include: {
      organization: true,
      amounts: { where: { isCurrent: true } },
    },
  });

  if (!waybill) {
    throw new AppError("NOT_FOUND", "بارنامه یافت نشد.");
  }

  // Idempotency: if already accepted, return existing acceptance
  if (waybill.commitmentStatus === "ACCEPTED") {
    const existing = await prisma.commitmentAcceptance.findFirst({
      where: { waybillId },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return {
        acceptanceId: existing.id,
        commitmentStatus: "ACCEPTED",
        contentHash: existing.contentHash,
        signedAt: existing.signedAt,
      };
    }
  }

  // 2. Fetch active commitment template
  const activeTemplate = await prisma.commitmentVersion.findFirst({
    where: {
      organizationId,
      status: "ACTIVE",
    },
    orderBy: { isDefault: "desc" },
  });

  if (!activeTemplate) {
    throw new AppError(
      "COMMITMENT_NO_ACTIVE_VERSION",
      "هیچ نسخه فعالی از تعهدنامه برای این شرکت تعریف نشده است."
    );
  }

  // 3. Prepare server variables and render commitment text
  const currentAmount = waybill.amounts[0];
  const formattedAmount = currentAmount
    ? Number(currentAmount.amount).toLocaleString("fa-IR")
    : "۰";

  const variables: Record<string, string> = {
    driver_name: waybill.driverNameRaw,
    waybill_number: waybill.waybillNumber,
    amount: formattedAmount,
    issue_date: waybill.issueDate.toLocaleDateString("fa-IR"),
    origin: waybill.origin || "نامشخص",
    destination: waybill.destination || "نامشخص",
    organization_name: waybill.organization.name,
  };

  const renderedText = renderCommitmentText(activeTemplate.body, variables);
  const contentHash = crypto.createHash("sha256").update(renderedText).digest("hex");

  // 4. Validate and store signature
  const cleanBase64 = signatureBase64.replace(/^data:image\/[a-z]+;base64,/, "");
  const signatureBuffer = Buffer.from(cleanBase64, "base64");
  validateSignatureBuffer(signatureBuffer);

  const signatureDocId = crypto.randomUUID();
  const storageKey = `organizations/${organizationId}/signatures/${signatureDocId}.png`;
  const storage = getStorageProvider();
  await storage.put(storageKey, signatureBuffer, "image/png");

  // 5. In transaction: create signature document, record acceptance, transition waybill
  return prisma.$transaction(async (tx) => {
    // Save signature as Document
    await tx.document.create({
      data: {
        id: signatureDocId,
        organizationId,
        waybillId: waybill.id,
        documentType: "SIGNATURE",
        storageKey,
        fileSize: signatureBuffer.length,
        mimeType: "image/png",
        sha256Hash: crypto.createHash("sha256").update(signatureBuffer).digest("hex"),
        matchingStatus: "MANUALLY_ATTACHED",
      },
    });

    // Record acceptance snapshot
    const acceptance = await tx.commitmentAcceptance.create({
      data: {
        organizationId,
        waybillId: waybill.id,
        commitmentVersionId: activeTemplate.id,
        contentHash,
        renderedText,
        signatureDocumentId: signatureDocId,
        mobileVerified: true,
        sessionId: session.sessionId,
        signedAt: new Date(),
        ip: clientIp,
        userAgent,
      },
    });

    // Transition waybill commitment_status to ACCEPTED
    await tx.waybill.update({
      where: { id: waybill.id },
      data: {
        commitmentStatus: "ACCEPTED",
        version: { increment: 1 },
      },
    });

    // Audit log
    await createAuditLogEntry(tx, {
      organizationId,
      actorType: "DRIVER",
      actorId: session.sessionId,
      action: "COMMITMENT_ACCEPTED",
      entityType: "WAYBILL",
      entityId: waybill.id,
      afterJson: {
        commitmentVersionId: activeTemplate.id,
        contentHash,
        signatureDocumentId: signatureDocId,
      },
      ip: clientIp,
      userAgent,
    });

    return {
      acceptanceId: acceptance.id,
      commitmentStatus: "ACCEPTED",
      contentHash,
      signedAt: acceptance.signedAt,
    };
  });
}

export interface DeclineDriverCommitmentInput {
  sessionToken: string;
  reason?: string;
  clientIp?: string;
  userAgent?: string;
}

/**
 * Records driver refusal to accept commitment. Transitions waybill to DECLINED and notifies operator.
 */
export async function declineDriverCommitment(
  input: DeclineDriverCommitmentInput
) {
  const { sessionToken, reason, clientIp, userAgent } = input;

  const session = await validateDriverSession(sessionToken);
  const { organizationId, waybillId } = session;

  const waybill = await prisma.waybill.findUnique({
    where: { id: waybillId },
  });

  if (!waybill) {
    throw new AppError("NOT_FOUND", "بارنامه یافت نشد.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.waybill.update({
      where: { id: waybill.id },
      data: {
        commitmentStatus: "DECLINED",
        version: { increment: 1 },
      },
    });

    // Operator notification
    await tx.notification.create({
      data: {
        organizationId,
        title: "رد تعهدنامه توسط راننده",
        message: `راننده بارنامه شماره «${waybill.waybillNumber}» با تعهدنامه مخالفت کرد. دلیل اعلامی: ${reason || "بدون توضیح"}`,
        entityType: "WAYBILL",
        entityId: waybill.id,
      },
    });

    await createAuditLogEntry(tx, {
      organizationId,
      actorType: "DRIVER",
      actorId: session.sessionId,
      action: "COMMITMENT_DECLINED",
      entityType: "WAYBILL",
      entityId: waybill.id,
      afterJson: { reason },
      ip: clientIp,
      userAgent,
    });

    return {
      success: true,
      commitmentStatus: "DECLINED",
    };
  });
}
