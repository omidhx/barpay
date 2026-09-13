import { NextRequest, NextResponse } from "next/server";
import {
  acceptDriverCommitment,
  declineDriverCommitment,
} from "@/modules/commitments/commitment-service";
import { AppError } from "@/lib/errors/exceptions";

export async function POST(req: NextRequest) {
  try {
    const sessionToken =
      req.cookies.get("driver_session")?.value ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    if (!sessionToken) {
      return NextResponse.json(
        { error: "ابتدا باید از طریق کد پیامکی وارد شوید.", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { action = "ACCEPT", signatureBase64, reason } = body || {};

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      undefined;
    const userAgent = req.headers.get("user-agent") || undefined;

    if (action === "DECLINE") {
      const result = await declineDriverCommitment({
        sessionToken,
        reason,
        clientIp,
        userAgent,
      });
      return NextResponse.json(result);
    }

    if (!signatureBase64) {
      return NextResponse.json(
        { error: "ارسال امضای ترسیمی الزامی است.", code: "SIGNATURE_REQUIRED" },
        { status: 400 }
      );
    }

    const result = await acceptDriverCommitment({
      sessionToken,
      signatureBase64,
      clientIp,
      userAgent,
    });

    return NextResponse.json(result);
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
        error: "خطا در ثبت تعهدنامه رخ داده است.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
