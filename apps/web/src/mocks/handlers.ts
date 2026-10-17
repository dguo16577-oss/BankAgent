import { scheduleHandlers } from "./schedule-handlers";
import { applicationHandlers } from "./application-handlers";
import { publicHandlers } from "./public/handlers";
import { securityHandlers } from "./security-handlers";
import { wealthHandlers } from "./wealth-handlers";
import { spendingHandlers } from "./spending-handlers";
import { cardHandlers } from "./card-handlers";
import { depositHandlers } from "./deposit-handlers";
import { http, HttpResponse } from "msw";
import { bankingStore } from "./bank/store";
import { paymentHandlers } from "./payment-handlers";
import type { components } from "@/generated/customer-api";
import {
  queryDemoTransactions,
  getDemoTransaction,
  TransactionQueryError,
} from "./data/transaction-query";
export const handlers = [
  ...publicHandlers,
  ...securityHandlers,
  ...applicationHandlers,
  ...wealthHandlers,
  ...spendingHandlers,
  ...paymentHandlers,
  ...scheduleHandlers,
  ...cardHandlers,
  ...depositHandlers,
  http.get("/customer/transactions", ({ request }) => {
    try {
      return HttpResponse.json(
        queryDemoTransactions(
          new URL(request.url).searchParams,
          bankingStore.read().transactions,
          `m4-${bankingStore.read().revision}`,
        ),
      );
    } catch (error) {
      if (error instanceof TransactionQueryError)
        return HttpResponse.json(
          {
            code: error.code,
            message: error.message,
          } satisfies components["schemas"]["ApiError"],
          { status: 400 },
        );
      return HttpResponse.json(
        {
          code: "INTERNAL_ERROR",
          message: "Transactions are temporarily unavailable.",
        } satisfies components["schemas"]["ApiError"],
        { status: 500 },
      );
    }
  }),
  http.get("/customer/transactions/:transactionId", ({ params }) => {
    const data = getDemoTransaction(
      String(params.transactionId),
      bankingStore.read().transactions,
      bankingStore.accounts().accounts,
    );
    return data
      ? HttpResponse.json(data)
      : HttpResponse.json(
          {
            code: "TRANSACTION_NOT_FOUND",
            message: "Transaction not found.",
          } satisfies components["schemas"]["ApiError"],
          { status: 404 },
        );
  }),
  http.get("/customer/overview", () =>
    HttpResponse.json(bankingStore.overview()),
  ),
  http.get("/customer/accounts", () =>
    HttpResponse.json(bankingStore.accounts()),
  ),
  http.get("/customer/accounts/:accountId", ({ params }) => {
    const account = bankingStore.account(String(params.accountId));
    if (!account)
      return HttpResponse.json(
        {
          code: "ACCOUNT_NOT_FOUND",
          message: "Account not found.",
        } satisfies components["schemas"]["ApiError"],
        { status: 404 },
      );
    return HttpResponse.json(account);
  }),
];
