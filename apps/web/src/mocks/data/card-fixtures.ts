import type { components } from "@/generated/customer-api";
type Schema = components["schemas"];
export function initialCards(): Schema["CardDetail"][] {
  const common = {
    status: "ACTIVE" as const,
    linkedAccount: {
      id: "acc_current",
      displayName: "CNY Current",
      maskedAccountNumber: "•••• 1048",
    },
    controls: {
      onlinePayments: true,
      internationalPayments: true,
      atmWithdrawals: true,
      contactless: true,
    },
    version: 0,
    updatedAt: "2026-09-27T10:30:00+08:00",
  };
  return structuredClone([
    {
      ...common,
      id: "card_aster_debit",
      displayName: "Visa Debit",
      maskedNumber: "••8821",
      scheme: "VISA",
      type: "DEBIT",
    },
    {
      ...common,
      id: "card_aster_credit",
      displayName: "Mastercard Credit",
      maskedNumber: "••1937",
      scheme: "MASTERCARD",
      type: "CREDIT",
    },
  ]);
}
export function summarizeCard(
  card: Schema["CardDetail"],
): Schema["CardSummary"] {
  const { id, displayName, maskedNumber, scheme, type, status, linkedAccount } =
    card;
  return structuredClone({
    id,
    displayName,
    maskedNumber,
    scheme,
    type,
    status,
    linkedAccount,
  });
}
// Only Current-account card purchases have known attribution in the M3 sample.
// Other historical records remain unattributed; no synthetic payments are added.
export function attributeCard(
  transaction: Schema["TransactionSummary"],
): Schema["TransactionSummary"] {
  if (transaction.type !== "CARD_PAYMENT") return transaction;
  if (transaction.accountId === "acc_current")
    return {
      ...transaction,
      cardId: "card_aster_debit",
      cardMaskedNumber: "••8821",
    };
  if (!transaction.merchant) return transaction;
  return {
    ...transaction,
    merchant: {
      id: transaction.merchant.id,
      name: transaction.merchant.name,
      location: transaction.merchant.location,
    },
  };
}
