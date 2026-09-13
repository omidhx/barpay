/**
 * Public interface for notifications module.
 */
export interface NotificationPayload {
  organizationId: string;
  userId?: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

export interface SmsJobPayload {
  organizationId: string;
  recipientMobile: string;
  templateKey: string;
  variables: Record<string, string>;
}

// Module export boundary
export * from "./sms-provider";
export * from "./notification-service";
export * from "./in-app-notification-service";
export * from "./sms-monitoring-service";
