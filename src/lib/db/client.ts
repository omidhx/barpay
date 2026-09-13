import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Creates an organization-scoped Prisma client extension.
 * Follows data-model.md §1 & database.md:
 * "organization_id always comes from the server session... injected via a Prisma Client Extension"
 */
export function getTenantDb(organizationId: string) {
  if (!organizationId) {
    throw new Error(
      "TENANT_CONTEXT_MISSING: organizationId الزامی است و باید از نشست معتبر سرور استخراج شود."
    );
  }

  return prisma.$extends({
    name: "tenantIsolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const tenantModels = [
            "Waybill",
            "WaybillAmount",
            "Payment",
            "PaymentReview",
            "PaymentRefund",
            "PaymentGateway",
            "GatewayTransaction",
            "BankCard",
            "Driver",
            "DriverAccessLink",
            "DriverSession",
            "CommitmentVersion",
            "CommitmentAcceptance",
            "ReleaseAuthorization",
            "Document",
            "DocumentAccessEvent",
            "ImportBatch",
            "NotificationJob",
            "Notification",
            "AuditLog",
          ];

          if (tenantModels.includes(model)) {
            // Automatically scope findMany, findFirst, update, delete, count, etc.
            if (
              [
                "findFirst",
                "findMany",
                "count",
                "aggregate",
                "groupBy",
                "update",
                "updateMany",
                "delete",
                "deleteMany",
              ].includes(operation)
            ) {
              const queryArgs = (args as { where?: Record<string, unknown> }) || {};
              queryArgs.where = {
                ...queryArgs.where,
                organizationId,
              };
              return query(queryArgs as typeof args);
            }

            if (operation === "create") {
              const createArgs = (args as { data?: Record<string, unknown> }) || {};
              createArgs.data = {
                ...createArgs.data,
                organizationId,
              };
              return query(createArgs as typeof args);
            }

            if (operation === "createMany") {
              const createManyArgs =
                (args as { data?: Array<Record<string, unknown>> }) || {};
              if (Array.isArray(createManyArgs.data)) {
                createManyArgs.data = createManyArgs.data.map((item) => ({
                  ...item,
                  organizationId,
                }));
              }
              return query(createManyArgs as typeof args);
            }
          }

          return query(args);
        },
      },
    },
  });
}
