import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getPanelOrgId } from "@/lib/auth/panel-org";
import {
  uploadAndMatchPdfs,
  attachDocumentManually,
} from "@/modules/documents/matching-service";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";

export async function GET(request: NextRequest) {
  try {
    const orgId = await getPanelOrgId(request);
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");

    const whereClause: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (status) {
      whereClause.matchingStatus = status;
    }

    const documents = await prisma.document.findMany({
      where: whereClause,
      include: {
        waybill: {
          select: {
            id: true,
            waybillNumber: true,
            driverNameRaw: true,
            driverMobileRaw: true,
            shipmentStatus: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      ok: true,
      data: documents,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getPanelOrgId(request);
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      throw new AppError("VALIDATION_ERROR", "هیچ فایل PDF انتخاب نشده است.");
    }

    const fileBuffers = await Promise.all(
      files.map(async (f) => ({
        filename: f.name,
        buffer: Buffer.from(await f.arrayBuffer()),
      }))
    );

    const matchResult = await uploadAndMatchPdfs({
      organizationId: orgId,
      files: fileBuffers,
    });

    return NextResponse.json({
      ok: true,
      data: matchResult,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const orgId = await getPanelOrgId(request);
    const body = await request.json();
    const { documentId, waybillId } = body;

    if (!documentId || !waybillId) {
      throw new AppError("VALIDATION_ERROR", "شناسه سند و شناسه بارنامه الزامی است.");
    }

    const updatedDoc = await attachDocumentManually({
      organizationId: orgId,
      documentId,
      waybillId,
    });

    return NextResponse.json({
      ok: true,
      data: updatedDoc,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
