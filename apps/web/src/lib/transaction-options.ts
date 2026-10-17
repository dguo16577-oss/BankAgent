import type { components } from "@/generated/customer-api";

// Exhaustive presentation maps checked against generated contract enums.
export const statuses = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  FAILED: "Failed",
  REVERSED: "Reversed",
  CANCELLED: "Cancelled",
} satisfies Record<components["schemas"]["TransactionStatus"], string>;
export const directions = { CREDIT: "Credit", DEBIT: "Debit" } satisfies Record<
  components["schemas"]["TransactionDirection"],
  string
>;
export const types = {
  CARD_PAYMENT: "Card payment",
  BANK_TRANSFER: "Bank transfer",
  SALARY: "Salary",
  DIRECT_DEBIT: "Direct debit",
  CASH_WITHDRAWAL: "Cash withdrawal",
  FEE: "Fee",
  INTEREST: "Interest",
  FX_EXCHANGE: "FX exchange",
  INVESTMENT_PURCHASE: "Investment purchase",
  INVESTMENT_REDEMPTION: "Investment redemption",
} satisfies Record<components["schemas"]["TransactionType"], string>;
export const categories = {
  DINING: "Dining",
  GROCERIES: "Groceries",
  SHOPPING: "Shopping",
  TRANSPORT: "Transport",
  ENTERTAINMENT: "Entertainment",
  SUBSCRIPTIONS: "Subscriptions",
  HOUSING: "Housing",
  INCOME: "Income",
  TRANSFER: "Transfer",
  TRAVEL: "Travel",
  HEALTH: "Health",
  OTHER: "Other",
  INVESTMENT: "Investment",
} satisfies Record<components["schemas"]["TransactionCategory"], string>;
