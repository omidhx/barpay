/**
 * Public interface for audit module.
 */
export interface AuditLogEntry {
  actorType: "USER" | "DRIVER" | "SYSTEM";
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: Record<string, unknown>;
  afterJson?: Record<string, unknown>;
  correlationId?: string;
  ip?: string;
  userAgent?: string;
}

// Module export boundary
