import { NextRequest, NextResponse } from "next/server";
import { listRefunds, recordRefund } from "@/modules/payments/refunds/refund-service";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";
import { prisma } from "@/lib/db/client";
import { RefundStatus } from "@prisma/client";

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

    const waybillId = searchParams.get("waybillId") || undefined;
    const status = (searchParams.get("status") as RefundStatus) || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const { items, total } = await listRefunds({
      organizationId: orgId,
      waybillId,
      status,
      limit,
      offset,
    });

    const serialized = items.map((r) => ({
      ...r,
      amount: r.amount.toString(),
    }));

    return NextResponse.json({ ok: true, data: { items: serialized, total } });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getOrgId(request);
    const body = await request.json();

    const operatorId = request.headers.get("x-user-id") || body.operatorId || "panel-operator";
    const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "panel";

    if (!body.waybillId || !body.amount) {
      throw new AppError("VALIDATION_ERROR", "شناسه بارنامه و مبلغ بازگشت الزامی است.");
    }

    const amount = BigInt(body.amount.toString());

    const refund = await recordRefund({
      organizationId: orgId,
      waybillId: body.waybillId,
      paymentId: body.paymentId,
      amount,
      reason: body.reason,
      actor: {
        actorType: "USER",
        actorId: operatorId,
        ip,
        userAgent,
        correlationId: request.headers.get("x-correlation-id"),
      },
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          refund: {
            ...refund,
            amount: refund.amount.toString(),
          },
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
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
    // Database trigger trg_check_refund_ceiling raises REFUND_CEILING_EXCEEDED
    if (error instanceof Error && error.message.includes("REFUND_CEILING_EXCEEDED")) {
      return NextResponse.json(
        getErrorResponse("REFUND_CEILING_EXCEEDED"),
        { status: 422 }
      );
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
