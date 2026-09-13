import { NextRequest, NextResponse } from "next/server";
import { authorizeRelease } from "@/modules/delivery/release-service";
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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: waybillId } = await context.params;
    const orgId = await getOrgId(request);
    const body = await request.json().catch(() => ({}));

    const operatorId = request.headers.get("x-user-id") || body.authorizedBy || "panel-supervisor";
    const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "panel";

    const result = await authorizeRelease({
      organizationId: orgId,
      waybillId,
      authorizedBy: operatorId,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      actor: {
        actorType: "USER",
        actorId: operatorId,
        ip,
        userAgent,
        correlationId: request.headers.get("x-correlation-id"),
      },
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        {
          ok: false,
          data: null,
          error: {
            code: error.code,
            humanMessage: error.humanMessage,
            actionHint: error.actionHint,
            retryable: error.retryable,
          },
        },
        { status: error.httpStatus }
      );
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
