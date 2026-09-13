import { NextRequest, NextResponse } from "next/server";
import {
  getApprovedPaymentsReport,
  generateSafeCsv,
} from "@/modules/reports/reporting-service";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";
import { prisma } from "@/lib/db/client";
import { PaymentMethod } from "@prisma/client";

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
    const methodParam = searchParams.get("method") as PaymentMethod | null;
    const search = searchParams.get("search") || undefined;
    const exportFormat = searchParams.get("export");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const report = await getApprovedPaymentsReport({
      organizationId: orgId,
      fromDate: fromDateParam ? new Date(fromDateParam) : undefined,
      toDate: toDateParam ? new Date(toDateParam) : undefined,
      method: methodParam || undefined,
      search,
      limit: exportFormat === "csv" ? 10000 : limit,
      offset: exportFormat === "csv" ? 0 : offset,
    });

    if (exportFormat === "csv") {
      const headers = [
        "شماره بارنامه",
        "نام راننده",
        "موبایل راننده",
        "مبلغ تأییدشده (ریال)",
        "روش پرداخت",
        "بانک",
        "شماره پیگیری",
        "شماره مرجع",
        "کارت واریزکننده",
        "تاریخ تأیید",
        "توضیحات بررسی",
      ];

      const rows = report.items.map((item) => [
        item.waybillNumber,
        item.driverName,
        item.driverMobile,
        item.amount.toString(),
        item.method === "GATEWAY" ? "درگاه اینترنتی" : "کارت به کارت / فیش",
        item.bankName || "-",
        item.trackingNumber || "-",
        item.referenceNumber || "-",
        item.payerCardMasked || "-",
        item.reviewedAt ? item.reviewedAt.toISOString() : "-",
        item.reviewNotes || "-",
      ]);

      const csvContent = generateSafeCsv(headers, rows);

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="approved-payments-${Date.now()}.csv"`,
        },
      });
    }

    const serializedItems = report.items.map((item) => ({
      ...item,
      amount: item.amount.toString(),
    }));

    return NextResponse.json({
      ok: true,
      data: {
        items: serializedItems,
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
