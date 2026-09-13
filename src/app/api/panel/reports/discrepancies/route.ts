import { NextRequest, NextResponse } from "next/server";
import {
  getDiscrepanciesReport,
  generateSafeCsv,
} from "@/modules/reports/reporting-service";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";
import { prisma } from "@/lib/db/client";
import { PaymentStatus } from "@prisma/client";

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
    const statusParam = searchParams.get("status") as PaymentStatus | null;
    const exportFormat = searchParams.get("export");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const report = await getDiscrepanciesReport({
      organizationId: orgId,
      fromDate: fromDateParam ? new Date(fromDateParam) : undefined,
      toDate: toDateParam ? new Date(toDateParam) : undefined,
      status: statusParam || undefined,
      limit: exportFormat === "csv" ? 10000 : limit,
      offset: exportFormat === "csv" ? 0 : offset,
    });

    if (exportFormat === "csv") {
      const headers = [
        "شماره بارنامه",
        "نام راننده",
        "موبایل راننده",
        "وضعیت پرداخت",
        "مبلغ اولیه (ریال)",
        "مبلغ جاری قابل پرداخت (ریال)",
        "مجموع پرداختی‌های تأییدشده (ریال)",
        "مبلغ مابقی بدهی (ریال)",
        "تعداد نسخه‌های اصلاح مبلغ",
        "تاریخ آخرین تغییر",
      ];

      const rows = report.items.map((item) => [
        item.waybillNumber,
        item.driverName,
        item.driverMobile,
        item.paymentStatus,
        item.initialPayableAmount.toString(),
        item.currentPayableAmount.toString(),
        item.totalApprovedPaid.toString(),
        item.residualDue.toString(),
        item.amountsCount.toString(),
        item.updatedAt.toISOString(),
      ]);

      const csvContent = generateSafeCsv(headers, rows);

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="discrepancies-report-${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        items: report.items.map((item) => ({
          ...item,
          initialPayableAmount: item.initialPayableAmount.toString(),
          currentPayableAmount: item.currentPayableAmount.toString(),
          totalApprovedPaid: item.totalApprovedPaid.toString(),
          residualDue: item.residualDue.toString(),
        })),
        totalCount: report.totalCount,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
