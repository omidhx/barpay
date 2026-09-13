import { NextRequest, NextResponse } from "next/server";
import { getSmsMonitoringDashboard } from "@/modules/notifications/sms-monitoring-service";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";
import { prisma } from "@/lib/db/client";

async function getOrgId(request: NextRequest): Promise<string> {
  const headerOrg = request.headers.get("x-organization-id");
  if (headerOrg) return headerOrg;

  const defaultOrg = await prisma.organization.findFirst();
  if (defaultOrg) return defaultOrg.id;

  throw new AppError("UNAUTHORIZED", "سازمان مشخص نشده است.");
}

export async function GET(request: NextRequest) {
  try {
    const orgId = await getOrgId(request);
    const dashboard = await getSmsMonitoringDashboard(orgId);

    return NextResponse.json({
      ok: true,
      data: dashboard,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
