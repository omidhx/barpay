import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import {
  verifyDriverAccessLink,
  validateDriverSession,
} from "@/modules/auth/driver-auth";
import { renderCommitmentText } from "@/modules/commitments/commitment-service";
import { DriverPortalClient, WaybillViewData } from "./DriverPortalClient";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function DriverPortalPage({ params }: PageProps) {
  const { token } = await params;

  // 1. Verify link
  let linkData;
  try {
    linkData = await verifyDriverAccessLink(token);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "لینک دسترسی نامعتبر است.";
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
        <div className="max-w-md w-full bg-white p-6 rounded-2xl shadow-sm border border-red-100 text-center space-y-4">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
            !
          </div>
          <h1 className="text-lg font-bold text-slate-900">لینک دسترسی غیرفعال است</h1>
          <p className="text-xs text-slate-600 leading-relaxed">{errorMsg}</p>
          <div className="pt-2 text-xs text-slate-400">
            لطفاً در صورت نیاز به ارسال مجدد لینک یا بروز مشکل، با واحد ترابری شرکت تماس حاصل فرمایید.
          </div>
        </div>
      </div>
    );
  }

  // 2. Check for active session cookie
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("driver_session")?.value;

  let isAuthenticated = false;
  let waybillViewData: WaybillViewData | null = null;

  if (sessionToken) {
    try {
      const validatedSession = await validateDriverSession(sessionToken);
      if (validatedSession.waybillId === linkData.waybillId) {
        isAuthenticated = true;

        // Fetch detailed waybill data
        const waybill = await prisma.waybill.findUnique({
          where: { id: linkData.waybillId },
          include: {
            organization: {
              include: { settings: true },
            },
            amounts: { where: { isCurrent: true } },
          },
        });

        if (waybill) {
          const currentAmount = waybill.amounts[0];
          const formattedAmount = currentAmount
            ? currentAmount.amount.toString()
            : "0";

          // Fetch active commitment template
          const template = await prisma.commitmentVersion.findFirst({
            where: {
              organizationId: waybill.organizationId,
              status: "ACTIVE",
            },
            orderBy: { isDefault: "desc" },
          });

          let commitmentText: string | null = null;
          if (template) {
            try {
              commitmentText = renderCommitmentText(template.body, {
                driver_name: waybill.driverNameRaw,
                waybill_number: waybill.waybillNumber,
                amount: Number(formattedAmount).toLocaleString("fa-IR"),
                issue_date: waybill.issueDate.toLocaleDateString("fa-IR"),
                origin: waybill.origin || "نامشخص",
                destination: waybill.destination || "نامشخص",
                organization_name: waybill.organization.name,
              });
            } catch {
              commitmentText = template.body;
            }
          }

          waybillViewData = {
            id: waybill.id,
            waybillNumber: waybill.waybillNumber,
            driverName: waybill.driverNameRaw,
            driverMobile: waybill.driverMobileRaw,
            origin: waybill.origin,
            destination: waybill.destination,
            payableAmount: formattedAmount,
            shipmentStatus: waybill.shipmentStatus,
            commitmentStatus: waybill.commitmentStatus,
            paymentStatus: waybill.paymentStatus,
            commitmentText,
            enforcementMode: waybill.organization.settings?.commitmentEnforcement ?? "OFF",
          };
        }
      }
    } catch {
      // Session invalid or expired: keep isAuthenticated = false
      isAuthenticated = false;
    }
  }

  return (
    <DriverPortalClient
      token={token}
      linkData={linkData}
      waybillData={waybillViewData}
      initialSessionActive={isAuthenticated}
    />
  );
}
