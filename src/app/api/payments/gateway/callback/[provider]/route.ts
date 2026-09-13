import { NextRequest, NextResponse } from "next/server";
import { handleGatewayCallback } from "@/modules/payments/gateways/gateway-service";
import { GatewayProviderCode } from "@/modules/payments/gateways/adapters";
import { AppError } from "@/lib/errors/exceptions";

interface RouteParams {
  params: Promise<{ provider: string }>;
}

async function processCallback(request: NextRequest, providerParam: string) {
  const providerCode = providerParam.toUpperCase() as GatewayProviderCode;

  const url = new URL(request.url);
  const queryParams: Record<string, string> = {};
  url.searchParams.forEach((val, key) => {
    queryParams[key] = val;
  });

  let bodyParams: Record<string, unknown> = {};
  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      bodyParams = (await request.json()) as Record<string, unknown>;
    } else if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const formData = await request.formData();
      formData.forEach((val, key) => {
        bodyParams[key] = typeof val === "string" ? val : val.name;
      });
    }
  } catch {
    // Ignore body parsing errors, proceed with query params
  }

  const state =
    queryParams.state ||
    (bodyParams.state as string) ||
    queryParams.orderId ||
    (bodyParams.orderId as string) ||
    queryParams.ResNum ||
    (bodyParams.ResNum as string) ||
    undefined;

  const providerReference =
    queryParams.Authority ||
    queryParams.trackId ||
    (bodyParams.RefNum as string) ||
    (bodyParams.token as string) ||
    undefined;

  const linkToken = queryParams.token || (bodyParams.token as string) || undefined;

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    undefined;
  const userAgent = request.headers.get("user-agent") || undefined;

  const redirectBase = linkToken ? `/driver/${linkToken}` : "/driver";

  try {
    const result = await handleGatewayCallback({
      provider: providerCode,
      state,
      providerReference,
      queryParams,
      bodyParams,
      clientIp,
      userAgent,
    });

    const statusParam = result.status;
    const refParam = result.referenceNumber ? `&ref=${encodeURIComponent(result.referenceNumber)}` : "";

    return NextResponse.redirect(
      new URL(`${redirectBase}?payment_status=${statusParam}${refParam}`, request.url)
    );
  } catch (error) {
    const errorCode = error instanceof AppError ? error.code : "GATEWAY_CALLBACK_ERROR";
    return NextResponse.redirect(
      new URL(`${redirectBase}?payment_status=FAILED&error=${errorCode}`, request.url)
    );
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { provider } = await params;
  return processCallback(request, provider);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { provider } = await params;
  return processCallback(request, provider);
}
