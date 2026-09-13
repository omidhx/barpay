import { NextRequest, NextResponse } from "next/server";
import { correctWaybillAmount } from "@/modules/waybills/amount-correction-service";
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
    const body = await request.json();

    const operatorId = request.headers.get("x-user-id") || body.operatorId || "panel-operator";
    const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "panel";

    if (!body.newAmount) {
      throw new AppError("VALIDATION_ERROR", "مبلغ جدید الزامی است.");
    }

    const newAmount = BigInt(body.newAmount.toString());

    const result = await correctWaybillAmount({
      organizationId: orgId,
      waybillId,
      newAmount,
      reason: body.reason,
      actor: {
        actorType: "USER",
        actorId: operatorId,
        ip,
        userAgent,
        correlationId: request.headers.get("x-correlation-id"),
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        ...result,
        previousAmount: result.previousAmount.toString(),
        newAmount: result.newAmount.toString(),
        totalApprovedPayments: result.totalApprovedPayments.toString(),
        residualAmount: result.residualAmount.toString(),
      },
    });
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
