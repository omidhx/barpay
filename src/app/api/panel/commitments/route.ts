import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getPanelOrgId } from "@/lib/auth/panel-org";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  try {
    const orgId = await getPanelOrgId(request);

    const versions = await prisma.commitmentVersion.findMany({
      where: { organizationId: orgId },
      include: {
        _count: {
          select: { acceptances: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const activeVersion = versions.find((v) => v.status === "ACTIVE" && v.isDefault) || versions[0] || null;

    return NextResponse.json({
      ok: true,
      data: {
        versions: versions.map((v) => ({
          id: v.id,
          title: v.title,
          templateKey: v.templateKey,
          body: v.body,
          contentHash: v.contentHash,
          status: v.status,
          isDefault: v.isDefault,
          acceptancesCount: v._count.acceptances,
          createdAt: v.createdAt.toISOString(),
          updatedAt: v.updatedAt.toISOString(),
        })),
        activeVersion: activeVersion
          ? {
              id: activeVersion.id,
              title: activeVersion.title,
              body: activeVersion.body,
              contentHash: activeVersion.contentHash,
            }
          : null,
      },
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

    const { title, templateKey, templateBody } = body;

    if (!title || !templateBody) {
      return NextResponse.json(
        { ok: false, message: "عنوان و متن تعهدنامه الزامی است." },
        { status: 400 }
      );
    }

    const contentHash = crypto.createHash("sha256").update(templateBody).digest("hex");

    const newVersion = await prisma.commitmentVersion.create({
      data: {
        organizationId: orgId,
        title,
        templateKey: templateKey || `COMMITMENT_V${Date.now()}`,
        body: templateBody,
        variablesJson: [
          "driver_name",
          "waybill_number",
          "amount",
          "issue_date",
          "origin",
          "destination",
          "organization_name",
        ],
        contentHash,
        status: "DRAFT",
        isDefault: false,
      },
    });

    return NextResponse.json({ ok: true, data: newVersion }, { status: 201 });
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
    const { versionId } = body;

    if (!versionId) {
      return NextResponse.json({ ok: false, message: "شناسه نسخه الزامی است." }, { status: 400 });
    }

    // Set all other versions to not default
    await prisma.commitmentVersion.updateMany({
      where: { organizationId: orgId },
      data: { isDefault: false, status: "RETIRED" },
    });

    // Activate selected version
    const activated = await prisma.commitmentVersion.update({
      where: { id: versionId },
      data: { isDefault: true, status: "ACTIVE" },
    });

    return NextResponse.json({ ok: true, data: activated });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
