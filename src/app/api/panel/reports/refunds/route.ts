import { NextRequest, NextResponse } from "next/server";
import {
  getRefundsReport,
  generateSafeCsv,
} from "@/modules/reports/reporting-service";
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

    const fromDateParam = searchParams.get("fromDate");
    const toDateParam = searchParams.get("toDate");
    const statusParam = searchParams.get("status") as RefundStatus | null;
    const exportFormat = searchParams.get("export");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const report = await getRefundsReport({
      organizationId: orgId,
      status: statusParam || undefined,
      fromDate: fromDateParam ? new Date(fromDateParam) : undefined,
      toDate: toDateParam ? new Date(toDateParam) : undefined,
      limit: exportFormat === "csv" ? 10000 : limit,
      offset: exportFormat === "csv" ? 0 : offset,
    });

    if (exportFormat === "csv") {
      const headers = [
        "شناسه بازگشت وجه",
        "شناسه بارنامه",
        "مبلغ (ریال)",
        "وضعیت",
        "علت بازگشت",
        "ثبت‌کننده",
        "تأییدکننده",
        "تاریخ تأیید",
        "تاریخ ثبت",
      ];

      const rows = report.items.map((item) => [
        item.id,
        item.waybillId,
        item.amount.toString(),
        item.status,
        item.reason,
        item.recordedBy,
        item.approvedBy || "-",
        item.approvedAt ? item.approvedAt.toISOString() : "-",
        item.createdAt.toISOString(),
      ]);

      const csvContent = generateSafeCsv(headers, rows);

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="refunds-report-${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        items: report.items.map((item) => ({
          ...item,
          amount: item.amount.toString(),
        })),
        totalCount: report.totalCount,
        totalAmount: report.totalAmount.toString(),
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
