import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { AppError } from "@/lib/errors/exceptions";
import { normalizeDigits } from "@/lib/utils/digits";
import { isValidCardNumber, getBankInfoFromCard, formatCardNumber } from "@/lib/utils/luhn";
import { isValidIranianIban, formatIranianIban } from "@/lib/utils/iban";

export const BankCardSchema = z.object({
  bankCode: z.string().min(1, "کد یا نام بانک الزامی است."),
  holderFirstName: z.string().min(1, "نام صاحب حساب الزامی است."),
  holderLastName: z.string().min(1, "نام خانوادگی صاحب حساب الزامی است."),
  cardNumber: z
    .string()
    .transform((val) => normalizeDigits(val).replace(/\D/g, ""))
    .refine((val) => isValidCardNumber(val), {
      message: "شماره کارت ۱۶ رقمی معتبر نیست (کنترل لوهن ناموفق بود).",
    }),
  accountNumber: z
    .string()
    .optional()
    .transform((val) => (val ? normalizeDigits(val).trim() : undefined)),
  iban: z
    .string()
    .transform((val) => normalizeDigits(val).trim().toUpperCase().replace(/\s+/g, ""))
    .refine((val) => isValidIranianIban(val), {
      message: "شماره شبا معتبر نیست (کنترل MOD-97 ناموفق بود).",
    }),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
  notes: z.string().optional(),
});

export type BankCardInput = z.input<typeof BankCardSchema>;

export async function createBankCard(organizationId: string, input: BankCardInput) {
  const validated = BankCardSchema.parse(input);

  // If bankCode is not explicitly matched, attempt to infer from BIN
  const bankInfo = getBankInfoFromCard(validated.cardNumber);
  const effectiveBankCode =
    validated.bankCode === "AUTO" || !validated.bankCode ? bankInfo.code : validated.bankCode;

  return prisma.bankCard.create({
    data: {
      organizationId,
      bankCode: effectiveBankCode,
      holderFirstName: validated.holderFirstName.trim(),
      holderLastName: validated.holderLastName.trim(),
      cardNumber: validated.cardNumber,
      accountNumber: validated.accountNumber,
      iban: validated.iban,
      isActive: validated.isActive,
      displayOrder: validated.displayOrder,
      notes: validated.notes?.trim(),
    },
  });
}

export async function updateBankCard(
  organizationId: string,
  cardId: string,
  input: Partial<BankCardInput>
) {
  const existing = await prisma.bankCard.findFirst({
    where: { id: cardId, organizationId },
  });

  if (!existing) {
    throw new AppError("NOT_FOUND", "کارت بانکی مورد نظر یافت نشد.");
  }

  const merged = {
    bankCode: input.bankCode ?? existing.bankCode,
    holderFirstName: input.holderFirstName ?? existing.holderFirstName,
    holderLastName: input.holderLastName ?? existing.holderLastName,
    cardNumber: input.cardNumber ?? existing.cardNumber,
    accountNumber: input.accountNumber ?? (existing.accountNumber ?? undefined),
    iban: input.iban ?? existing.iban,
    isActive: input.isActive ?? existing.isActive,
    displayOrder: input.displayOrder ?? existing.displayOrder,
    notes: input.notes ?? (existing.notes ?? undefined),
  };

  const validated = BankCardSchema.parse(merged);

  return prisma.bankCard.update({
    where: { id: cardId },
    data: {
      bankCode: validated.bankCode,
      holderFirstName: validated.holderFirstName.trim(),
      holderLastName: validated.holderLastName.trim(),
      cardNumber: validated.cardNumber,
      accountNumber: validated.accountNumber,
      iban: validated.iban,
      isActive: validated.isActive,
      displayOrder: validated.displayOrder,
      notes: validated.notes?.trim(),
    },
  });
}

export async function deleteBankCard(organizationId: string, cardId: string) {
  const existing = await prisma.bankCard.findFirst({
    where: { id: cardId, organizationId },
  });

  if (!existing) {
    throw new AppError("NOT_FOUND", "کارت بانکی مورد نظر یافت نشد.");
  }

  return prisma.bankCard.delete({
    where: { id: cardId },
  });
}

export async function listOrganizationBankCards(organizationId: string) {
  return prisma.bankCard.findMany({
    where: { organizationId },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
  });
}

export interface DriverCardDisplay {
  id: string;
  bankCode: string;
  bankName: string;
  holderFullName: string;
  cardNumberFormatted: string;
  cardNumberRaw: string;
  accountNumber?: string | null;
  ibanFormatted: string;
  ibanRaw: string;
}

/**
 * Returns active bank cards for driver portal with copy-friendly fields.
 */
export async function getActiveBankCardsForDriver(
  organizationId: string
): Promise<DriverCardDisplay[]> {
  const cards = await prisma.bankCard.findMany({
    where: { organizationId, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
  });

  return cards.map((c) => {
    const bankInfo = getBankInfoFromCard(c.cardNumber);
    return {
      id: c.id,
      bankCode: c.bankCode,
      bankName: bankInfo.name,
      holderFullName: `${c.holderFirstName} ${c.holderLastName}`.trim(),
      cardNumberFormatted: formatCardNumber(c.cardNumber),
      cardNumberRaw: c.cardNumber,
      accountNumber: c.accountNumber,
      ibanFormatted: formatIranianIban(c.iban),
      ibanRaw: c.iban,
    };
  });
}
