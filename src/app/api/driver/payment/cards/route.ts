import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validateDriverSession } from "@/modules/auth/driver-auth";
import { getActiveBankCardsForDriver } from "@/modules/payments/cards/bank-card-service";
import { AppError } from "@/lib/errors/exceptions";
import { getErrorResponse } from "@/lib/errors/catalog";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("driver_session")?.value;

    if (!sessionToken) {
      throw new AppError("UNAUTHORIZED", "نشست راننده نامعتبر است.");
    }

    const session = await validateDriverSession(sessionToken);
    const cards = await getActiveBankCardsForDriver(session.organizationId);

    return NextResponse.json({
      ok: true,
      data: { cards },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        getErrorResponse(error.code, error.correlationId),
        { status: error.httpStatus }
      );
    }
    return NextResponse.json(getErrorResponse("INTERNAL_ERROR"), { status: 500 });
  }
}
