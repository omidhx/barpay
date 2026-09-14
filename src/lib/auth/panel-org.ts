import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { AppError } from "@/lib/errors/exceptions";

/**
 * Resolves active organization ID for panel routes.
 * Supports x-organization-id header with automatic fallback to primary logistics org.
 */
export async function getPanelOrgId(request?: NextRequest): Promise<string> {
  if (request) {
    const headerOrg = request.headers.get("x-organization-id");
    if (headerOrg) return headerOrg;
  }

  const primaryOrg = await prisma.organization.findFirst({
    where: { slug: "khalij-fars-logistics" },
  });
  if (primaryOrg) return primaryOrg.id;

  const fallback = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (fallback) return fallback.id;

  throw new AppError("UNAUTHORIZED", "سازمان فعال در سامانه یافت نشد.");
}
