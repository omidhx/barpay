import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/db/client";
import { canReleaseAndGrantDownload } from "@/modules/delivery/release-service";
import { getStorageProvider } from "@/lib/storage";
import { getErrorResponse, ERROR_CATALOG } from "@/lib/errors/catalog";

const HMAC_SECRET =
  process.env.APP_SECRET ||
  process.env.GATEWAY_CREDENTIALS_KEY ||
  "barnameh-pay-default-secret-key-32-bytes-minimum";

function computeHmacSha256(value: string): string {
  return crypto.createHmac("sha256", HMAC_SECRET).update(value).digest("hex");
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const tokenHash = computeHmacSha256(token);

    // 1. Locate link record
    const link = await prisma.driverAccessLink.findUnique({
      where: { tokenHash },
      include: {
        waybill: true,
      },
    });

    if (!link || link.expiresAt < new Date() || link.revokedAt) {
      return NextResponse.json(getErrorResponse("UNAUTHORIZED"), { status: 401 });
    }

    // 2. Validate session
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("driver_session")?.value;
    let driverSessionId: string | undefined;

    if (sessionToken) {
      const sessionHash = computeHmacSha256(sessionToken);
      const session = await prisma.driverSession.findUnique({
        where: { sessionTokenHash: sessionHash },
      });
      if (session && session.expiresAt > new Date() && !session.revokedAt) {
        driverSessionId = session.id;
      }
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || undefined;

    // 3. Atomic canRelease evaluation and download grant
    const grant = await canReleaseAndGrantDownload({
      organizationId: link.organizationId,
      waybillId: link.waybillId,
      driverSessionId,
      ip,
      userAgent,
    });

    if (!grant.granted || !grant.document) {
      const primaryError = grant.unmetConditions[0] || "RELEASE_NOT_AUTHORIZED";
      const catalogEntry = ERROR_CATALOG[primaryError] || {
        humanMessage: "شرایط آزادسازی فایل بارنامه هنوز فراهم نشده است.",
        actionHint: "مراحل تعهدنامه و پرداخت را بررسی فرمایید.",
        httpStatus: 403,
      };

      return NextResponse.json(
        {
          ok: false,
          data: null,
          error: {
            code: primaryError,
            humanMessage: catalogEntry.humanMessage,
            actionHint: catalogEntry.actionHint,
            unmetConditions: grant.unmetConditions,
          },
        },
        { status: catalogEntry.httpStatus || 403 }
      );
    }

    // 4. Retrieve and stream document buffer
    const storage = getStorageProvider();
    const fileBuffer = await storage.get(grant.document.storageKey);

    const safeWaybillNumber = link.waybill.waybillNumber || "document";
    const filename = encodeURIComponent(`barnameh-${safeWaybillNumber}.pdf`);

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": grant.document.mimeType || "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${filename}`,
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch {
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
