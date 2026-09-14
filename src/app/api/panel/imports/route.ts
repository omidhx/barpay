import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getPanelOrgId } from "@/lib/auth/panel-org";
import { processImportFile, commitImportBatch } from "@/modules/imports/import-service";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";

export async function GET(request: NextRequest) {
  try {
    const orgId = await getPanelOrgId(request);

    const batches = await prisma.importBatch.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      ok: true,
      data: batches,
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
    const file = formData.get("file") as File | null;

    if (!file) {
      throw new AppError("VALIDATION_ERROR", "فایل اکسل بارگذاری نشده است.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = await processImportFile({
      organizationId: orgId,
      filename: file.name,
      fileBuffer: buffer,
    });

    // Serialize BigInt in sample rows
    const serializedSampleRows = preview.sampleRows.map((r) => ({
      ...r,
      normalizedData: r.normalizedData
        ? {
            ...r.normalizedData,
            rawExcelAmount: r.normalizedData.rawExcelAmount.toString(),
            payableAmount: r.normalizedData.payableAmount.toString(),
            grossAmount: r.normalizedData.grossAmount?.toString() ?? null,
            commissionAmount: r.normalizedData.commissionAmount?.toString() ?? null,
            deductionsAmount: r.normalizedData.deductionsAmount?.toString() ?? null,
            netAmount: r.normalizedData.netAmount?.toString() ?? null,
          }
        : null,
    }));

    return NextResponse.json({
      ok: true,
      data: {
        ...preview,
        sampleRows: serializedSampleRows,
      },
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
    const { batchId } = body;

    if (!batchId) {
      throw new AppError("VALIDATION_ERROR", "شناسه بچ مشخص نشده است.");
    }

    const result = await commitImportBatch({
      organizationId: orgId,
      batchId,
    });

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
