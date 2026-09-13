import { NextRequest, NextResponse } from "next/server";
import { getGatewayTransactionsReport } from "@/modules/reports/reporting-service";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";
import { prisma } from "@/lib/db/client";
import { GatewayProvider } from "@prisma/client";

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

    const providerParam = searchParams.get("provider") as GatewayProvider | null;
    const fromDateParam = searchParams.get("fromDate");
    const toDateParam = searchParams.get("toDate");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const report = await getGatewayTransactionsReport({
      organizationId: orgId,
      provider: providerParam || undefined,
      fromDate: fromDateParam ? new Date(fromDateParam) : undefined,
      toDate: toDateParam ? new Date(toDateParam) : undefined,
      limit,
      offset,
    });

    const serializedSummary = report.providersSummary.map((s) => ({
      ...s,
      totalVerifiedAmount: s.totalVerifiedAmount.toString(),
    }));

    const serializedItems = report.items.map((i) => ({
      ...i,
      amount: i.amount.toString(),
    }));

    return NextResponse.json({
      ok: true,
      data: {
        providersSummary: serializedSummary,
        totalCount: report.totalCount,
        items: serializedItems,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
