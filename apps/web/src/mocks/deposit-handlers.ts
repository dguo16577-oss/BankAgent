import { http, HttpResponse } from "msw";
import type { components } from "@/generated/customer-api";
import { bankingStore, decimal, minor } from "./bank/store";
import {
  securityFixture,
  temporaryTestCredential,
} from "./data/security-fixture";
import { rates } from "./public/rates";

type S = components["schemas"];
const problem = (code: S["ApiError"]["code"], status: number) =>
  HttpResponse.json({ code, message: code }, { status });

export const depositHandlers = [
  http.post("/customer/currency-accounts", async ({ request }) => {
    const body = (await request.json()) as { currency?: string };
    const currency = body.currency;
    const rate = rates.items.find(
      (r) => r.id === `${currency?.toLowerCase()}-cny`,
    );
    if (!currency || !rate || currency === "CNY")
      return problem("INVALID_REQUEST", 400);
    const next = bankingStore.read();
    if (
      next.accounts.some(
        (a) =>
          a.type === "MULTI_CURRENCY" &&
          a.currency === currency &&
          a.status === "ACTIVE",
      )
    )
      return problem("CURRENCY_ACCOUNT_ALREADY_OPEN", 409);
    const account: S["AccountSummary"] = {
      id: `acct_${crypto.randomUUID()}`,
      displayName: `${currency} Account`,
      type: "MULTI_CURRENCY",
      status: "ACTIVE",
      currency: currency as S["AccountSummary"]["currency"],
      maskedAccountNumber: `•••• ${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`,
      balance: { amount: "0.00", currency: currency as S["Money"]["currency"] },
      pendingAmount: {
        amount: "0.00",
        currency: currency as S["Money"]["currency"],
      },
      availableBalance: {
        amount: "0.00",
        currency: currency as S["Money"]["currency"],
      },
      baseCurrencyEquivalent: {
        value: { amount: "0.00", currency: "CNY" },
        sourceCurrency: currency as S["ExchangeEquivalent"]["sourceCurrency"],
        exchangeRate: rate.value,
        conversionAsOf: rates.asOf,
        conversionSource: "DEMO_RATE",
      },
    };
    next.accounts.push(account);
    next.asOf = bankingStore.clock.now();
    bankingStore.commit(next);
    return HttpResponse.json(account, { status: 201 });
  }),
  http.get("/customer/time-deposits", () =>
    HttpResponse.json({
      items: Object.values(bankingStore.read().timeDeposits),
    }),
  ),
  http.post("/customer/time-deposits", async ({ request }) => {
    const body = (await request.json()) as {
      sourceAccountId?: string;
      amount?: string;
      password?: string;
      confirm?: boolean;
    };
    const key = request.headers.get("Idempotency-Key");
    const next = bankingStore.read();
    const email = next.currentSessionId
      ? next.sessionCredential[next.currentSessionId]
      : undefined;
    if (
      ![securityFixture, temporaryTestCredential].some(
        (c) => c.email === email && c.password === body.password,
      )
    )
      return problem("INVALID_CREDENTIALS", 401);
    if (
      !key ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(key) ||
      !body.confirm ||
      !body.amount ||
      !/^(0|[1-9]\d*)\.\d{2}$/.test(body.amount)
    )
      return problem("INVALID_REQUEST", 400);
    const oldId = next.timeDepositKeys[key];
    if (oldId) {
      const old = next.timeDeposits[oldId];
      return old.sourceAccountId === body.sourceAccountId &&
        old.amount.amount === body.amount
        ? HttpResponse.json(old, { status: 201 })
        : problem("IDEMPOTENCY_KEY_REUSED", 409);
    }
    const source = next.accounts.find((a) => a.id === body.sourceAccountId);
    if (!source) return problem("ACCOUNT_NOT_FOUND", 404);
    if (
      source.currency !== "CNY" ||
      source.status !== "ACTIVE" ||
      !["CURRENT", "SAVINGS"].includes(source.type)
    )
      return problem("TIME_DEPOSIT_NOT_ELIGIBLE", 409);
    const debit = minor(body.amount);
    if (debit <= BigInt(0) || debit > minor("1000000.00"))
      return problem("INVALID_AMOUNT", 400);
    if (minor(source.availableBalance.amount) < debit)
      return problem("INSUFFICIENT_FUNDS", 409);
    const rate = rates.items.find((r) => r.id === "deposit");
    if (!rate) return problem("TIME_DEPOSIT_NOT_ELIGIBLE", 409);
    const now = bankingStore.clock.now();
    const maturity = new Date(now);
    maturity.setUTCMonth(maturity.getUTCMonth() + 12);
    const id = `dep_${crypto.randomUUID()}`;
    const depositAccountId = `acct_${crypto.randomUUID()}`;
    source.balance.amount = decimal(minor(source.balance.amount) - debit);
    source.availableBalance.amount = decimal(
      minor(source.availableBalance.amount) - debit,
    );
    next.accounts.push({
      id: depositAccountId,
      displayName: "12-month Time Deposit",
      type: "TIME_DEPOSIT",
      status: "ACTIVE",
      currency: "CNY",
      maskedAccountNumber: "•••• 8001",
      balance: { amount: body.amount, currency: "CNY" },
      availableBalance: { amount: body.amount, currency: "CNY" },
      pendingAmount: { amount: "0.00", currency: "CNY" },
    });
    const holding: S["TimeDeposit"] = {
      id,
      sourceAccountId: source.id,
      depositAccountId,
      amount: { amount: body.amount, currency: "CNY" },
      termMonths: 12,
      annualRate: rate.value,
      openedAt: now,
      maturesAt: maturity.toISOString(),
      status: "ACTIVE",
    };
    next.timeDeposits[id] = holding;
    next.timeDepositKeys[key] = id;
    for (const [accountId, direction, title] of [
      [source.id, "DEBIT", "Open 12-month time deposit"],
      [depositAccountId, "CREDIT", "Time deposit principal"],
    ] as const) {
      next.transactions.push({
        id: `txn_${crypto.randomUUID()}`,
        accountId,
        title,
        amount: { amount: body.amount, currency: "CNY" },
        direction,
        status: "COMPLETED",
        type: "BANK_TRANSFER",
        category: "TRANSFER",
        occurredAt: now,
        bookedAt: now,
        reference: id,
      });
    }
    next.asOf = now;
    next.revision += 2;
    bankingStore.commit(next);
    return HttpResponse.json(holding, { status: 201 });
  }),
];
