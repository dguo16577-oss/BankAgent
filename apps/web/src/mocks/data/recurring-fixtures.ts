import type { components } from "@/generated/customer-api";
import { demoProfile, demoTransactions } from "./demo-profile";
type S = components["schemas"];
export function summarizeRecurring(
  item: S["RecurringPaymentDetail"],
): S["RecurringPaymentSummary"] {
  const {
    transactionHistory: _history,
    detectionProvenance: _provenance,
    version: _version,
    ...summary
  } = item;
  void _history;
  void _provenance;
  void _version;
  return structuredClone(summary);
}
export function initialRecurring(): S["RecurringPaymentDetail"][] {
  const managed: S["RecurringPaymentDetail"][] = demoProfile.recurring.map(
    (item) => {
      const history = demoTransactions
        .filter(
          (t) =>
            t.accountId === "acc_current" &&
            t.title === item.title &&
            t.status === "COMPLETED",
        )
        .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
      return {
        id: item.id,
        displayName: item.title,
        type: item.id === "rec_rent" ? "DIRECT_DEBIT" : "CARD_SUBSCRIPTION",
        status: "ACTIVE",
        frequency: "MONTHLY",
        source: "BANK_MANAGED",
        sourceAccountId: "acc_current",
        usualAmount: item.amount,
        nextExpectedAt: item.dueAt,
        lastPaidAt: item.paidAt,
        ...(history[0].cardId
          ? { cardId: history[0].cardId, merchant: history[0].merchant }
          : {}),
        transactionHistory: history.map((t) => t.id),
        managementCapability: "STOP_FUTURE_PAYMENTS",
        version: 0,
      };
    },
  );
  const matched = demoTransactions
    .filter(
      (t) =>
        t.accountId === "acc_current" &&
        t.title === "Bookshop" &&
        t.status === "COMPLETED",
    )
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  managed.push({
    id: "rec_bookshop",
    displayName: "Bookshop",
    type: "DETECTED_RECURRING_PAYMENT",
    status: "ACTIVE",
    frequency: "MONTHLY",
    source: "DETECTED_PATTERN",
    sourceAccountId: "acc_current",
    cardId: matched[0].cardId,
    merchant: matched[0].merchant,
    usualAmount: matched[0].amount,
    nextExpectedAt: null,
    lastPaidAt: matched.at(-1)!.occurredAt,
    managementCapability: "NONE",
    transactionHistory: matched.map((t) => t.id),
    version: 0,
    detectionProvenance: {
      matchedTransactionIds: matched.map((t) => t.id),
      observedOccurrences: matched.length,
      firstObservedAt: matched[0].occurredAt,
      lastObservedAt: matched.at(-1)!.occurredAt,
    },
  });
  return structuredClone(managed);
}
