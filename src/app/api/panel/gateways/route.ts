import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { encryptCredentials } from "@/lib/crypto/encryption";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";

async function getOrgId(request: NextRequest): Promise<string> {
  const headerOrg = request.headers.get("x-organization-id");
  if (headerOrg) return headerOrg;

  const defaultOrg = await prisma.organization.findFirst();
  if (defaultOrg) return defaultOrg.id;

  throw new AppError("UNAUTHORIZED", "سازمان مشخص نشده است.");
}

export async function GET(request: NextRequest) {
  try {
    const orgId = await getOrgId(request);
    const gateways = await prisma.paymentGateway.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        provider: true,
        mode: true,
        isActive: true,
        lastHealthCheckAt: true,
        lastHealthStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, data: { gateways } });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getOrgId(request);
    const body = await request.json();

    const { provider, credentials, mode = "LIVE", isActive = false } = body;

    if (!provider || !credentials) {
      throw new AppError("INVALID_ARGUMENT", "مشخصات درگاه و پارامترهای احراز هویت الزامی است.");
    }

    // Encrypt credentials using AES-256-GCM before persisting
    const encryptedCredentials = encryptCredentials(credentials);

    // If active, ensure other gateways are deactivated (idx_payment_gateways_active_per_org)
    const result = await prisma.$transaction(async (tx) => {
      if (isActive) {
        await tx.paymentGateway.updateMany({
          where: { organizationId: orgId, isActive: true },
          data: { isActive: false },
        });
      }

      return tx.paymentGateway.create({
        data: {
          organizationId: orgId,
          provider,
          credentialsJson: encryptedCredentials as unknown as Prisma.InputJsonValue,
          mode,
          isActive,
        },
        select: {
          id: true,
          provider: true,
          mode: true,
          isActive: true,
          createdAt: true,
        },
      });
    });

    return NextResponse.json({ ok: true, data: { gateway: result } }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(
      {
        ok: false,
        data: null,
        error: {
          code: "INVALID_ARGUMENT",
          humanMessage: error instanceof Error ? error.message : "خطا در ثبت اطلاعات درگاه پرداخت",
          retryable: false,
        },
      },
      { status: 400 }
    );
  }
}
