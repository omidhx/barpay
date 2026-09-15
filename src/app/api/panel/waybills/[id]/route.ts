import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getPanelOrgId } from "@/lib/auth/panel-org";
import { deriveWaybillPhase } from "@/lib/waybills/phase";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getPanelOrgId(request);
    const { id } = await params;

    const waybill = await prisma.waybill.findFirst({
      where: { id, organizationId: orgId },
      include: {
        amounts: {
          orderBy: { createdAt: "desc" },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          include: {
            reviews: {
              orderBy: { reviewedAt: "desc" },
            },
            refunds: {
              orderBy: { createdAt: "desc" },
            },
            payoutCard: true,
          },
        },
        documents: {
          orderBy: { createdAt: "desc" },
        },
        acceptances: {
          orderBy: { signedAt: "desc" },
          include: {
            commitmentVersion: true,
          },
        },
        releaseAuthorizations: {
          orderBy: { authorizedAt: "desc" },
        },
        gatewayTransactions: {
          orderBy: { createdAt: "desc" },
        },
        accessLinks: {
          where: { revokedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!waybill) {
      throw new AppError("NOT_FOUND", "بارنامه مورد نظر یافت نشد.");
    }

    // Fetch audit logs for this waybill
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        organizationId: orgId,
        entityType: "WAYBILL",
        entityId: id,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Derive phase
    const derivedPhase = deriveWaybillPhase({
      shipmentStatus: waybill.shipmentStatus,
      documentStatus: waybill.documentStatus,
      paymentStatus: waybill.paymentStatus,
      commitmentStatus: waybill.commitmentStatus,
      releaseStatus: waybill.releaseStatus,
    });

    // Current amount
    const currentAmount = waybill.amounts.find((a) => a.isCurrent) || waybill.amounts[0];

    // Compute remaining payable
    const approvedPaymentsSum = waybill.payments
      .filter((p) => p.status === "APPROVED")
      .reduce((sum, p) => sum + p.amount, 0n);

    const payableAmount = currentAmount ? currentAmount.amount : 0n;
    const remainingAmount = payableAmount > approvedPaymentsSum ? payableAmount - approvedPaymentsSum : 0n;

    // Serialize bigints
    const serialized = {
      id: waybill.id,
      waybillNumber: waybill.waybillNumber,
      waybillYear: waybill.waybillYear,
      driverName: waybill.driverNameRaw,
      driverMobile: waybill.driverMobileRaw,
      plateNumber: waybill.plateNumberRaw,
      issueDate: waybill.issueDate.toISOString(),
      origin: waybill.origin,
      destination: waybill.destination,
      grossAmount: waybill.grossAmount ? waybill.grossAmount.toString() : null,
      netAmount: waybill.netAmount ? waybill.netAmount.toString() : null,
      commissionAmount: waybill.commissionAmount ? waybill.commissionAmount.toString() : null,
      deductionsAmount: waybill.deductionsAmount ? waybill.deductionsAmount.toString() : null,
      shipmentStatus: waybill.shipmentStatus,
      documentStatus: waybill.documentStatus,
      paymentStatus: waybill.paymentStatus,
      commitmentStatus: waybill.commitmentStatus,
      releaseStatus: waybill.releaseStatus,
      version: waybill.version,
      createdAt: waybill.createdAt.toISOString(),
      updatedAt: waybill.updatedAt.toISOString(),
      derivedPhase,
      currentAmount: currentAmount
        ? {
            id: currentAmount.id,
            rawExcelAmount: currentAmount.rawExcelAmount.toString(),
            roundedAmount: currentAmount.roundedAmount.toString(),
            surchargeAmount: currentAmount.surchargeAmount.toString(),
            amount: currentAmount.amount.toString(),
            source: currentAmount.source,
            reason: currentAmount.reason,
            createdAt: currentAmount.createdAt.toISOString(),
          }
        : null,
      remainingAmount: remainingAmount.toString(),
      approvedPaymentsSum: approvedPaymentsSum.toString(),
      amountsHistory: waybill.amounts.map((a) => ({
        id: a.id,
        rawExcelAmount: a.rawExcelAmount.toString(),
        roundedAmount: a.roundedAmount.toString(),
        surchargeAmount: a.surchargeAmount.toString(),
        amount: a.amount.toString(),
        source: a.source,
        reason: a.reason,
        isCurrent: a.isCurrent,
        createdAt: a.createdAt.toISOString(),
      })),
      payments: waybill.payments.map((p) => ({
        id: p.id,
        amount: p.amount.toString(),
        method: p.method,
        status: p.status,
        trackingNumber: p.trackingNumber,
        referenceNumber: p.gatewayTransactionId || null,
        payerCardMasked: null,
        bankName: p.payoutCard ? `بانک ${p.payoutCard.bankCode}` : null,
        payoutCardNumber: p.payoutCard?.cardNumber || null,
        receiptDocumentId: p.receiptDocumentId,
        createdAt: p.createdAt.toISOString(),
        reviews: p.reviews.map((r) => ({
          id: r.id,
          decision: r.decision,
          notes: r.notes,
          reviewerId: r.reviewerId,
          reviewedAt: r.reviewedAt.toISOString(),
        })),
        refunds: p.refunds.map((rf) => ({
          id: rf.id,
          amount: rf.amount.toString(),
          reason: rf.reason,
          status: rf.status,
          createdAt: rf.createdAt.toISOString(),
        })),
      })),
      documents: waybill.documents.map((d) => ({
        id: d.id,
        documentType: d.documentType,
        storageKey: d.storageKey,
        fileSize: d.fileSize,
        matchingStatus: d.matchingStatus,
        matchingMethod: d.matchingMethod,
        extractedWaybillNumber: d.extractedWaybillNumber,
        createdAt: d.createdAt.toISOString(),
      })),
      acceptances: waybill.acceptances.map((ac) => ({
        id: ac.id,
        commitmentTitle: ac.commitmentVersion.title,
        contentHash: ac.contentHash,
        renderedText: ac.renderedText,
        signedAt: ac.signedAt.toISOString(),
        signatureDocumentId: ac.signatureDocumentId,
        ip: ac.ip,
      })),
      releaseAuthorizations: waybill.releaseAuthorizations.map((ra) => ({
        id: ra.id,
        authorizedBy: ra.authorizedBy,
        authorizedAt: ra.authorizedAt.toISOString(),
        expiresAt: ra.expiresAt ? ra.expiresAt.toISOString() : null,
      })),
      gatewayTransactions: waybill.gatewayTransactions.map((gt) => ({
        id: gt.id,
        provider: gt.provider,
        providerReference: gt.providerReference,
        amount: gt.amount.toString(),
        status: gt.status,
        errorCode: gt.errorCode,
        createdAt: gt.createdAt.toISOString(),
      })),
      driverLinkToken: waybill.accessLinks[0]?.tokenHash ? waybill.accessLinks[0].id : null,
      auditLogs: auditLogs.map((log) => ({
        id: log.id,
        eventType: log.action,
        actorType: log.actorType,
        actorId: log.actorId,
        prevStatus: log.beforeJson ? "ثبت قبلی" : null,
        newStatus: log.afterJson ? "تغییر وضعیت" : null,
        reason: log.correlationId,
        createdAt: log.createdAt.toISOString(),
      })),
    };

    return NextResponse.json({ ok: true, data: serialized });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(getErrorResponse(error.code), { status: error.httpStatus });
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
