import { createHash } from "crypto";
import { Prisma, PrismaClient } from "@prisma/client";

export interface CreateAuditLogInput {
  organizationId: string;
  actorType: "USER" | "DRIVER" | "SYSTEM";
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
  correlationId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Appends an immutable audit log entry inside the transaction.
 * Computes SHA-256 row_hash chained with prev_hash.
 */
export async function createAuditLogEntry(
  tx: Prisma.TransactionClient | PrismaClient,
  input: CreateAuditLogInput
) {
  // Find the last audit log hash in this organization
  const lastLog = await tx.auditLog.findFirst({
    where: { organizationId: input.organizationId },
    orderBy: { createdAt: "desc" },
    select: { rowHash: true },
  });

  const prevHash = lastLog?.rowHash ?? "GENESIS";
  const timestamp = new Date();

  // Deterministic payload for hash chain
  const hashPayload = JSON.stringify({
    org: input.organizationId,
    actorType: input.actorType,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.beforeJson,
    after: input.afterJson,
    prevHash,
    time: timestamp.toISOString(),
  });

  const rowHash = createHash("sha256").update(hashPayload).digest("hex");

  return tx.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeJson: input.beforeJson as Prisma.InputJsonValue | undefined,
      afterJson: input.afterJson as Prisma.InputJsonValue | undefined,
      correlationId: input.correlationId,
      prevHash,
      rowHash,
      ip: input.ip,
      userAgent: input.userAgent,
      createdAt: timestamp,
    },
  });
}
