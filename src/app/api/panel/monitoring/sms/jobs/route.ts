import { NextRequest, NextResponse } from "next/server";
import { listSmsJobs } from "@/modules/notifications/sms-monitoring-service";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";
import { prisma } from "@/lib/db/client";
import { NotificationJobStatus } from "@prisma/client";

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
    const searchParams = request.nextUrl.searchParams;

    const statusParam = searchParams.get("status") as NotificationJobStatus | null;
    const recipientParam = searchParams.get("recipient") || undefined;
    const templateKeyParam = searchParams.get("templateKey") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const { items, total } = await listSmsJobs({
      organizationId: orgId,
      status: statusParam || undefined,
      recipient: recipientParam,
      templateKey: templateKeyParam,
      limit,
      offset,
    });

    return NextResponse.json({
      ok: true,
      data: {
        items,
        total,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
