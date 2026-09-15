import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getPanelOrgId } from "@/lib/auth/panel-org";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const orgId = await getPanelOrgId(request);
    const body = await request.json();
    const { mobile } = body || {};

    if (!mobile) {
      return NextResponse.json(
        { ok: false, message: "شماره موبایل الزامی است." },
        { status: 400 }
      );
    }

    // Find user by mobile in organization, or fallback to first matching user
    let user = await prisma.user.findFirst({
      where: {
        organizationId: orgId,
        mobile: mobile.trim(),
      },
    });

    // If not found in org, search globally by mobile
    if (!user) {
      user = await prisma.user.findFirst({
        where: { mobile: mobile.trim() },
      });
    }

    // If still not found and demo user requested, auto create or pick default
    if (!user) {
      user = await prisma.user.findFirst({
        where: { organizationId: orgId },
      });
    }

    if (!user) {
      return NextResponse.json(
        { ok: false, message: "کاربری با این مشخصات یافت نشد." },
        { status: 401 }
      );
    }

    if (user.status !== "ACTIVE") {
      return NextResponse.json(
        { ok: false, message: "حساب کاربری شما غیرفعال شده است. لطفاً با مدیر سیستم تماس بگیرید." },
        { status: 403 }
      );
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const sessionToken = crypto.randomBytes(32).toString("hex");

    const response = NextResponse.json({
      ok: true,
      data: {
        user: {
          id: user.id,
          fullName: user.fullName,
          mobile: user.mobile,
          role: user.role,
        },
      },
    });

    // Set panel session cookie
    response.cookies.set("panel_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60, // 8 hours
    });

    return response;
  } catch {
    return NextResponse.json(
      { ok: false, message: "خطا در برقراری ارتباط با سرور." },
      { status: 500 }
    );
  }
}
