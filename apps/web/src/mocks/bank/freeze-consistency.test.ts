import { verifiedIntent, authorizationFor } from "@/test/verification";
import { expect, it } from "vitest";
import { bankingStore, minor } from "./store";
import { TransferService } from "./transfer-service";
import { CardService } from "./card-service";
import { RecurringService } from "./recurring-service";
import { WealthService } from "./wealth-service";
import { spendingSummary } from "./spending-analytics";
import { securityFixture } from "../data/security-fixture";
function consistent() {
  const state = bankingStore.read(),
    overview = bankingStore.overview(),
    accounts = bankingStore.accounts();
  expect(overview.totalBalance).toEqual(accounts.totalBalance);
  expect(overview.accounts).toEqual(accounts.accounts);
  expect(minor(accounts.totalBalance.amount)).toBe(
    accounts.accounts.reduce(
      (sum, a) =>
        sum + minor(a.baseCurrencyEquivalent?.value.amount ?? a.balance.amount),
      BigInt(0),
    ),
  );
  for (const a of accounts.accounts) {
    expect(
      minor(a.balance.amount) - minor(a.pendingAmount?.amount ?? "0.00"),
    ).toBe(minor(a.availableBalance.amount));
    const pending = state.transactions
      .filter(
        (t) =>
          t.accountId === a.id &&
          t.status === "PENDING" &&
          t.direction === "DEBIT",
      )
      .reduce((sum, t) => sum + minor(t.amount.amount), BigInt(0));
    expect(pending).toBe(minor(a.pendingAmount?.amount ?? "0.00"));
    for (const t of bankingStore.account(a.id)!.recentTransactions)
      expect(state.transactions.find((i) => i.id === t.id)).toEqual(t);
  }
  for (const t of state.transactions) {
    expect(minor(t.amount.amount)).toBeGreaterThanOrEqual(BigInt(0));
    expect(accounts.accounts.some((a) => a.id === t.accountId)).toBe(true);
    if (t.cardId)
      expect(
        state.cards.some(
          (c) => c.id === t.cardId && c.linkedAccount.id === t.accountId,
        ),
      ).toBe(true);
  }
  for (const a of accounts.accounts) {
    const fx = a.baseCurrencyEquivalent;
    if (fx) {
      const digits = fx.exchangeRate.split(".")[1].length,
        scale = BigInt(10) ** BigInt(digits);
      expect(minor(fx.value.amount)).toBe(
        (minor(a.balance.amount) * BigInt(fx.exchangeRate.replace(".", "")) +
          scale / BigInt(2)) /
          scale,
      );
      expect(fx.conversionSource).toBe("DEMO_RATE");
    }
  }
  for (const c of state.cards)
    expect(accounts.accounts.some((a) => a.id === c.linkedAccount.id)).toBe(
      true,
    );
  for (const r of state.recurringPayments)
    for (const id of r.transactionHistory)
      expect(
        state.transactions.some(
          (t) => t.id === id && t.accountId === r.sourceAccountId,
        ),
      ).toBe(true);
  expect(minor(state.portfolio.totalValue.amount)).toBe(
    state.portfolio.positions.reduce(
      (s, p) => s + minor(p.currentValue.amount),
      BigInt(0),
    ),
  );
  expect(overview.wealth?.total).toEqual(state.portfolio.totalValue);
  expect(overview.spending?.currentPeriod.amount).toEqual(
    spendingSummary(state).totalSpend,
  );
  for (const r of Object.values(state.transfers))
    expect(
      state.transactions.find((t) => t.id === r.transactionId),
    ).toMatchObject({ reference: r.reference, amount: r.amount });
  for (const r of Object.values(state.investmentOrders))
    expect(
      state.transactions.find((t) => t.id === r.transactionId),
    ).toMatchObject({ reference: r.reference, amount: r.totalDebit });
  const forbidden = [
    securityFixture.password,
    ...Object.values(state.demoSms)
      .map((message) => message.messageBody.match(/\b\d{6}\b/)?.[0])
      .filter(Boolean),
  ];
  const walk = (v: unknown) => {
    if (typeof v === "string") expect(forbidden).not.toContain(v);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk([
    state.securityEvents,
    overview,
    accounts,
    ...Object.values(state.transfers),
    ...Object.values(state.cardActions),
    ...Object.values(state.investmentOrders),
  ]);
}
it("M11 cross-domain consistency holds initially and after each M4–M7 mutation", async () => {
  consistent();
  const transfer = new TransferService(bankingStore),
    cards = new CardService(bankingStore),
    recurring = new RecurringService(bankingStore),
    wealth = new WealthService(bankingStore);
  const t = await verifiedIntent(
    transfer.prepare({
      sourceAccountId: "acc_current",
      recipientId: "recipient_zhang",
      amount: { amount: "500.00", currency: "CNY" },
    }),
  );
  transfer.execute(
    {
      actionAuthorizationId: authorizationFor(t),
      intentId: t.id,
      intentHash: t.intentHash,
    },
    "audit-transfer",
  );
  consistent();
  const c = await verifiedIntent(
    cards.prepare({
      cardId: "card_aster_debit",
      actionType: "FREEZE",
    }),
  );
  cards.execute(
    {
      actionAuthorizationId: authorizationFor(c),
      intentId: c.id,
      intentHash: c.intentHash,
    },
    "audit-card",
  );
  consistent();
  const r = await verifiedIntent(
    recurring.prepare({
      recurringPaymentId: "rec_netflix",
      actionType: "STOP_FUTURE_PAYMENTS",
    }),
  );
  recurring.execute(
    {
      actionAuthorizationId: authorizationFor(r),
      intentId: r.id,
      intentHash: r.intentHash,
    },
    "audit-recurring",
  );
  consistent();
  const check = wealth.createCheck({ productId: "product_bond" });
  const w = await verifiedIntent(
    wealth.prepare({
      productId: "product_bond",
      sourceAccountId: "acc_current",
      amount: { amount: "1000.00", currency: "CNY" },
      suitabilityCheckId: check.id,
    }),
  );
  wealth.execute(
    {
      actionAuthorizationId: authorizationFor(w),
      intentId: w.id,
      intentHash: w.intentHash,
    },
    "audit-investment",
  );
  consistent();
});
