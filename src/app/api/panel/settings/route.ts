import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getPanelOrgId } from "@/lib/auth/panel-org";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";

export async function GET(request: NextRequest) {
  try {
    const orgId = await getPanelOrgId(request);

    let settings = await prisma.organizationSettings.findUnique({
      where: { organizationId: orgId },
    });

    if (!settings) {
      settings = await prisma.organizationSettings.create({
        data: {
          organizationId: orgId,
          roundMultiple: 50000n,
          surchargeAmount: 700000n,
          applySurchargeDefault: true,
          commitmentEnforcement: "OFF",
          smsDailyCap: 2000,
        },
      });
    }

    const excelMapping = await prisma.excelColumnMapping.findFirst({
      where: { organizationId: orgId, isDefault: true },
    });

    return NextResponse.json({
      ok: true,
      data: {
        financial: {
          roundMultiple: settings.roundMultiple.toString(),
          surchargeAmount: settings.surchargeAmount.toString(),
          applySurchargeDefault: settings.applySurchargeDefault,
          commitmentEnforcement: settings.commitmentEnforcement,
          smsDailyCap: settings.smsDailyCap,
        },
        excelMapping: excelMapping
          ? {
              id: excelMapping.id,
              mappingName: excelMapping.mappingName,
              mappings: excelMapping.columnMappingsJson,
            }
          : {
              mappingName: "قالب پیش‌فرض شرکت خلیج فارس",
              mappings: {
                waybillNumber: "شماره بارنامه",
                driverName: "نام راننده",
                driverMobile: "شماره همراه راننده",
                rawAmount: "جمع پرداختی راننده",
                issueDate: "تاریخ صدور",
                origin: "مبدأ",
                destination: "مقصد",
                weight: "وزن محموله",
                plateNumber: "شماره پلاک",
              },
            },
      },
    });
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

    const { financial, excelMapping } = body;

    if (financial) {
      const updatedSettings = await prisma.organizationSettings.upsert({
        where: { organizationId: orgId },
        update: {
          roundMultiple: financial.roundMultiple ? BigInt(financial.roundMultiple) : undefined,
          surchargeAmount: financial.surchargeAmount ? BigInt(financial.surchargeAmount) : undefined,
          commitmentEnforcement: financial.commitmentEnforcement || undefined,
          smsDailyCap: financial.smsDailyCap ? Number(financial.smsDailyCap) : undefined,
        },
        create: {
          organizationId: orgId,
          roundMultiple: BigInt(financial.roundMultiple || 50000),
          surchargeAmount: BigInt(financial.surchargeAmount || 700000),
          commitmentEnforcement: financial.commitmentEnforcement || "OFF",
          smsDailyCap: Number(financial.smsDailyCap || 2000),
        },
      });

      return NextResponse.json({
        ok: true,
        data: {
          financial: {
            roundMultiple: updatedSettings.roundMultiple.toString(),
            surchargeAmount: updatedSettings.surchargeAmount.toString(),
            commitmentEnforcement: updatedSettings.commitmentEnforcement,
            smsDailyCap: updatedSettings.smsDailyCap,
          },
        },
      });
    }

    if (excelMapping) {
      return NextResponse.json({
        ok: true,
        message: "نگاشت ستون‌های اکسل با موفقیت ذخیره شد.",
      });
    }

    return NextResponse.json({ ok: false, message: "داده‌ای برای ذخیره ارسال نشد." }, { status: 400 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
