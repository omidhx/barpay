import { NextRequest, NextResponse } from "next/server";
import { requestDriverOtp } from "@/modules/auth/driver-auth";
import { AppError } from "@/lib/errors/exceptions";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = body?.token;

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "توکن دسترسی الزامی است.", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      undefined;

    const result = await requestDriverOtp({ token, clientIp });

    return NextResponse.json({
      success: true,
      maskedMobile: result.maskedMobile,
      expiresAt: result.expiresAt,
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(
        {
          error: err.humanMessage,
          code: err.code,
          hint: err.actionHint,
        },
        { status: err.httpStatus }
      );
    }

    return NextResponse.json(
      {
        error: "خطای ناشناخته در ارسال کد اعتبارسنجی رخ داده است.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
