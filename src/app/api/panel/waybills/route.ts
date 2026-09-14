import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getPanelOrgId } from "@/lib/auth/panel-org";
import { deriveWaybillPhase, WaybillPhase } from "@/lib/waybills/phase";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";

export async function GET(request: NextRequest) {
  try {
    const orgId = await getPanelOrgId(request);
    const searchParams = request.nextUrl.searchParams;

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const search = searchParams.get("search")?.trim();
    const phaseFilter = searchParams.get("phase") as WaybillPhase | null;

    const whereClause: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (search) {
      whereClause.OR = [
        { waybillNumber: { contains: search, mode: "insensitive" } },
        { driverNameRaw: { contains: search, mode: "insensitive" } },
        { driverMobileRaw: { contains: search } },
        { origin: { contains: search, mode: "insensitive" } },
        { destination: { contains: search, mode: "insensitive" } },
      ];
    }

    const waybills = await prisma.waybill.findMany({
      where: whereClause,
      include: {
        amounts: {
          where: { isCurrent: true },
          take: 1,
        },
        documents: {
          where: { matchingStatus: { not: "REPLACED" } },
          take: 1,
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        accessLinks: {
          where: { revokedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 1000, // Fetch up to 1000 for phase filtering in memory
    });

    const enriched = waybills.map((w) => {
      const derivedPhase = deriveWaybillPhase({
        shipmentStatus: w.shipmentStatus,
        documentStatus: w.documentStatus,
        paymentStatus: w.paymentStatus,
        commitmentStatus: w.commitmentStatus,
        releaseStatus: w.releaseStatus,
      });

      const currentAmount = w.amounts[0];
      const activeDoc = w.documents[0];
      const latestPayment = w.payments[0];

      return {
        id: w.id,
        waybillNumber: w.waybillNumber,
        driverName: w.driverNameRaw,
        driverMobile: w.driverMobileRaw,
        origin: w.origin,
        destination: w.destination,
        issueDate: w.issueDate.toISOString(),
        shipmentStatus: w.shipmentStatus,
        documentStatus: w.documentStatus,
        commitmentStatus: w.commitmentStatus,
        paymentStatus: w.paymentStatus,
        releaseStatus: w.releaseStatus,
        phase: derivedPhase,
        amount: currentAmount ? currentAmount.amount.toString() : "0",
        rawAmount: currentAmount ? currentAmount.rawExcelAmount.toString() : "0",
        roundedAmount: currentAmount ? currentAmount.roundedAmount.toString() : "0",
        surchargeAmount: currentAmount ? currentAmount.surchargeAmount.toString() : "0",
        hasPdf: Boolean(activeDoc),
        pdfId: activeDoc?.id || null,
        latestPaymentMethod: latestPayment?.method || null,
        latestPaymentStatus: latestPayment?.status || null,
        createdAt: w.createdAt.toISOString(),
      };
    });

    // Apply phase filter if provided
    const filtered = phaseFilter
      ? enriched.filter((w) => w.phase === phaseFilter)
      : enriched;

    const totalCount = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      ok: true,
      data: {
        items: paginated,
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
