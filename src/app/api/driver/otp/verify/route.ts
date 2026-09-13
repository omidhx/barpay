import { NextRequest, NextResponse } from "next/server";
import { verifyDriverOtp } from "@/modules/auth/driver-auth";
import { AppError } from "@/lib/errors/exceptions";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, code } = body || {};

    if (!token || !code) {
      return NextResponse.json(
        { error: "توکن و کد اعتبارسنجی الزامی هستند.", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      undefined;

    const userAgent = req.headers.get("user-agent") || undefined;

    const result = await verifyDriverOtp({
      token,
      code,
      clientIp,
      userAgent,
    });

    const response = NextResponse.json({
      success: true,
      expiresAt: result.expiresAt,
    });

    // Set HTTP-only driver session cookie
    response.cookies.set("driver_session", result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 2 * 60 * 60, // 2 hours
    });

    return response;
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
        error: "خطا در بررسی کد اعتبارسنجی رخ داده است.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
