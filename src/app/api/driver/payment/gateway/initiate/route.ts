import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validateDriverSession } from "@/modules/auth/driver-auth";
import { initiateGatewayPayment } from "@/modules/payments/gateways/gateway-service";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("driver_session")?.value;

    if (!sessionToken) {
      throw new AppError("UNAUTHORIZED", "نشست راننده نامعتبر است.");
    }

    const session = await validateDriverSession(sessionToken);

    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    const host = request.headers.get("host") || "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const callbackBaseUrl = `${protocol}://${host}`;

    const body = await request.json().catch(() => ({}));
    const linkToken = body?.linkToken;

    const result = await initiateGatewayPayment({
      organizationId: session.organizationId,
      waybillId: session.waybillId,
      callbackBaseUrl,
      linkToken,
      clientIp,
      userAgent,
    });

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        getErrorResponse(error.code, error.correlationId),
        { status: error.httpStatus }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          humanMessage: error instanceof Error ? error.message : "خطا در شروع تراکنش درگاه",
          retryable: false,
        },
      },
      { status: 500 }
    );
  }
}
