import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getStorageProvider } from "@/lib/storage";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";

async function getOrgId(request: NextRequest): Promise<string> {
  const headerOrg = request.headers.get("x-organization-id");
  if (headerOrg) return headerOrg;

  const defaultOrg = await prisma.organization.findFirst();
  if (defaultOrg) return defaultOrg.id;

  throw new AppError("UNAUTHORIZED", "سازمان مشخص نشده است.");
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: waybillId } = await context.params;
    const orgId = await getOrgId(request);

    const waybill = await prisma.waybill.findFirst({
      where: { id: waybillId, organizationId: orgId },
      include: {
        documents: {
          where: {
            documentType: "WAYBILL_PDF",
            matchingStatus: { not: "REPLACED" },
          },
          take: 1,
        },
      },
    });

    if (!waybill) {
      return NextResponse.json(getErrorResponse("NOT_FOUND"), { status: 404 });
    }

    const pdfDoc = waybill.documents[0];
    if (!pdfDoc) {
      return NextResponse.json(getErrorResponse("DOCUMENT_NOT_VERIFIED"), { status: 404 });
    }

    const storage = getStorageProvider();
    const fileBuffer = await storage.get(pdfDoc.storageKey);

    const safeWaybillNumber = waybill.waybillNumber || "document";
    const filename = encodeURIComponent(`barnameh-${safeWaybillNumber}.pdf`);

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": pdfDoc.mimeType || "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${filename}`,
        "Content-Length": fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
