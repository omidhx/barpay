import { NextRequest, NextResponse } from "next/server";
import { getReviewQueue } from "@/modules/payments/review/payment-review-service";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";
import { prisma } from "@/lib/db/client";
import { PaymentStatus, PaymentMethod } from "@prisma/client";

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

    const statusParam = searchParams.get("status") as PaymentStatus | null;
    const methodParam = searchParams.get("method") as PaymentMethod | null;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const { items, total, staleCount } = await getReviewQueue({
      organizationId: orgId,
      status: statusParam || undefined,
      method: methodParam || undefined,
      limit,
      offset,
    });

    // Serialize BigInt to string for JSON transport (AGENTS.md rule)
    const serializedItems = items.map((item) => ({
      ...item,
      amount: item.amount.toString(),
      waybillAmount: item.waybillAmount.toString(),
      remainingAmount: item.remainingAmount.toString(),
    }));

    return NextResponse.json({
      ok: true,
      data: {
        items: serializedItems,
        total,
        staleCount,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
