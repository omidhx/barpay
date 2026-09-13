import { NextRequest, NextResponse } from "next/server";
import {
  createBankCard,
  listOrganizationBankCards,
} from "@/modules/payments/cards/bank-card-service";
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
    const cards = await listOrganizationBankCards(orgId);
    return NextResponse.json({ ok: true, data: { cards } });
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
    const card = await createBankCard(orgId, body);
    return NextResponse.json({ ok: true, data: { card } }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(
      {
        ok: false,
        data: null,
        error: {
          code: "INVALID_ARGUMENT",
          humanMessage: error instanceof Error ? error.message : "خطا در ثبت اطلاعات کارت بانکی",
          retryable: false,
        },
      },
      { status: 400 }
    );
  }
}
