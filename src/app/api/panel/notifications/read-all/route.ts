import { NextRequest, NextResponse } from "next/server";
import { markAllNotificationsAsRead } from "@/modules/notifications/in-app-notification-service";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";
import { prisma } from "@/lib/db/client";

async function getOrgAndUser(request: NextRequest): Promise<{ orgId: string; userId?: string }> {
  const headerOrg = request.headers.get("x-organization-id");
  const headerUser = request.headers.get("x-user-id") || undefined;

  if (headerOrg) return { orgId: headerOrg, userId: headerUser };

  const defaultOrg = await prisma.organization.findFirst();
  if (defaultOrg) return { orgId: defaultOrg.id, userId: headerUser };

  throw new AppError("UNAUTHORIZED", "سازمان مشخص نشده است.");
}

export async function POST(request: NextRequest) {
  try {
    const { orgId, userId } = await getOrgAndUser(request);

    const result = await markAllNotificationsAsRead(orgId, userId);

    return NextResponse.json({
      ok: true,
      data: {
        count: result.count,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
