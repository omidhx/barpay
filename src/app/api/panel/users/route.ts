import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getPanelOrgId } from "@/lib/auth/panel-org";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  try {
    const orgId = await getPanelOrgId(request);

    const users = await prisma.user.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fullName: true,
        mobile: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      data: { users },
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
    const body = await request.json();

    const { fullName, mobile, role } = body;

    if (!fullName || !mobile || !role) {
      return NextResponse.json(
        { ok: false, message: "نام و نام خانوادگی، شماره موبایل و نقش کاربر الزامی است." },
        { status: 400 }
      );
    }

    // Check unique mobile in organization
    const existing = await prisma.user.findUnique({
      where: {
        organizationId_mobile: {
          organizationId: orgId,
          mobile,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { ok: false, message: "کاربری با این شماره موبایل در سازمان ثبت شده است." },
        { status: 409 }
      );
    }

    // Default random password hash
    const initialPasswordHash = crypto.createHash("sha256").update(mobile + Date.now()).digest("hex");

    const newUser = await prisma.user.create({
      data: {
        organizationId: orgId,
        fullName,
        mobile,
        role,
        passwordHash: initialPasswordHash,
        status: "ACTIVE",
      },
      select: {
        id: true,
        fullName: true,
        mobile: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, data: newUser }, { status: 201 });
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
    const { userId, role, status } = body;

    if (!userId) {
      return NextResponse.json({ ok: false, message: "شناسه کاربر الزامی است." }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId, organizationId: orgId },
      data: {
        ...(role ? { role } : {}),
        ...(status ? { status } : {}),
      },
      select: {
        id: true,
        fullName: true,
        mobile: true,
        role: true,
        status: true,
      },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
