import { NextRequest, NextResponse } from "next/server";
import {
  getRoundingExcessReport,
  generateSafeCsv,
} from "@/modules/reports/reporting-service";
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
    const searchParams = request.nextUrl.searchParams;

    const fromDateParam = searchParams.get("fromDate");
    const toDateParam = searchParams.get("toDate");
    const exportFormat = searchParams.get("export");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const report = await getRoundingExcessReport({
      organizationId: orgId,
      fromDate: fromDateParam ? new Date(fromDateParam) : undefined,
      toDate: toDateParam ? new Date(toDateParam) : undefined,
      limit: exportFormat === "csv" ? 10000 : limit,
      offset: exportFormat === "csv" ? 0 : offset,
    });

    if (exportFormat === "csv") {
      const headers = [
        "شماره بارنامه",
        "نام راننده",
        "وضعیت پرداخت",
        "مبلغ خام اکسل (ریال)",
        "مبلغ گردشده (ریال)",
        "مازاد گرد کردن (ریال)",
        "مبلغ افزودنی (ریال)",
        "مبلغ نهایی قابل پرداخت (ریال)",
        "تاریخ ثبت",
      ];

      const rows = report.items.map((item) => [
        item.waybillNumber,
        item.driverName,
        item.paymentStatus,
        item.rawExcelAmount.toString(),
        item.roundedAmount.toString(),
        item.roundingExcess.toString(),
        item.surchargeAmount.toString(),
        item.payableAmount.toString(),
        item.createdAt.toISOString(),
      ]);

      const csvContent = generateSafeCsv(headers, rows);

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="rounding-excess-report-${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        summary: {
          totalCount: report.summary.totalCount,
          totalRawAmount: report.summary.totalRawAmount.toString(),
          totalRoundedAmount: report.summary.totalRoundedAmount.toString(),
          totalRoundingExcess: report.summary.totalRoundingExcess.toString(),
          totalSurcharge: report.summary.totalSurcharge.toString(),
          totalPayable: report.summary.totalPayable.toString(),
          roundedUpCount: report.summary.roundedUpCount,
          exactCount: report.summary.exactCount,
        },
        items: report.items.map((item) => ({
          ...item,
          rawExcelAmount: item.rawExcelAmount.toString(),
          roundedAmount: item.roundedAmount.toString(),
          roundingExcess: item.roundingExcess.toString(),
          surchargeAmount: item.surchargeAmount.toString(),
          payableAmount: item.payableAmount.toString(),
        })),
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
