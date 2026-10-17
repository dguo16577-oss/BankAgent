import { verifiedIntent, authorizationFor } from "@/test/verification";
import { SecurityService } from "./security-service";
import { securityFixture } from "../data/security-fixture";
import { expect, it, vi } from "vitest";
import { bankingStore, MockBankingStore } from "./store";
import { WealthService } from "./wealth-service";
import { TransferService } from "./transfer-service";
import { RecurringService } from "./recurring-service";
import { spendingSummary } from "./spending-analytics";
import { minor } from "./amount";
import {
  getPortfolio,
  getProducts,
  getProduct,
  getRiskProfile,
  createSuitability,
  getSuitability,
  prepareInvestment,
  getInvestmentIntent,
  executeInvestment,
  getInvestmentOrder,
} from "@/lib/api/wealth";
import { getOverview } from "@/lib/api/overview";
import { getAccount } from "@/lib/api/accounts";
import { getTransaction, getTransactions } from "@/lib/api/transactions";
import type { components } from "@/generated/customer-api";
type S = components["schemas"];
const service = new WealthService(bankingStore);
const body = (
  checkId: string,
  productId = "product_bond",
): S["CreateInvestmentOrderIntentRequest"] => ({
  productId,
  sourceAccountId: "acc_current",
  amount: { amount: "1000.00", currency: "CNY" },
  suitabilityCheckId: checkId,
});
const prepare = async () =>
  verifiedIntent(
    prepareInvestment(
      body((await createSuitability({ productId: "product_bond" })).id),
    ),
  );
it("returns the shared portfolio, product catalog, detail and R2 profile", async () => {
  const portfolio = await getPortfolio();
  expect(portfolio.totalValue.amount).toBe("18320.00");
  expect(portfolio.positions.map((p) => p.currentValue.amount)).toEqual([
    "10000.00",
    "5320.00",
    "3000.00",
  ]);
  expect(portfolio.gainLoss.amount).toBe("220.00");
  expect((await getOverview()).wealth?.total).toEqual(portfolio.totalValue);
  expect((await getProducts({})).items).toHaveLength(4);
  expect(await getProduct("product_bond")).toMatchObject({
    riskLevel: "R2",
    minimumInvestment: { amount: "1000.00" },
    fees: { amount: "0.00" },
    dataSource: "SIMULATED",
  });
  expect(await getRiskProfile()).toMatchObject({
    displayName: "Alex Chen",
    riskLevel: "R2",
  });
  expect(portfolio.monthlyChangePercent).toBe("1.22");
});
it("filters product type and risk at the API, including empty intersections", async () => {
  expect(
    (await getProducts({ type: "BOND_FUND" })).items.map((p) => p.id),
  ).toEqual(["product_bond"]);
  expect(
    (await getProducts({ riskLevel: "R3" })).items.map((p) => p.id),
  ).toEqual(["product_balanced"]);
  expect(
    (await getProducts({ type: "MONEY_MARKET", riskLevel: "R4" })).items,
  ).toEqual([]);
});
it.each([
  "type=STOCK",
  "riskLevel=R6",
  "riskLevel=",
  "riskLevel=R1&riskLevel=R2",
  "page=2",
])("rejects invalid catalog query %s", async (query) => {
  const response = await fetch(`/customer/wealth/products?${query}`);
  expect(response.status).toBe(400);
});
it.each([
  ["product_cash", "R1", "SUITABLE"],
  ["product_bond", "R2", "SUITABLE"],
  ["product_balanced", "R3", "NOT_SUITABLE"],
  ["product_equity", "R4", "NOT_SUITABLE"],
])("service checks %s %s as %s", async (productId, level, result) => {
  const check = await createSuitability({ productId });
  expect(check).toMatchObject({
    productId,
    productRiskLevel: level,
    userRiskLevel: "R2",
    result,
  });
  expect(check.reasons.length).toBeGreaterThan(0);
  expect(await getSuitability(check.id)).toEqual(check);
  if (result === "NOT_SUITABLE")
    await expect(
      verifiedIntent(
        prepareInvestment({
          ...body(check.id, productId),
          amount: { amount: "2000.00", currency: "CNY" },
        }),
      ),
    ).rejects.toMatchObject({ status: 422, code: "PRODUCT_NOT_SUITABLE" });
  expect(bankingStore.read().investmentOrderIntents).toEqual({});
});
it("requires a valid unexpired check for the exact product and user", async () => {
  await expect(
    verifiedIntent(prepareInvestment(body("missing"))),
  ).rejects.toMatchObject({
    status: 404,
    code: "SUITABILITY_CHECK_NOT_FOUND",
  });
  const other = await createSuitability({ productId: "product_cash" });
  await expect(
    verifiedIntent(prepareInvestment(body(other.id))),
  ).rejects.toMatchObject({
    status: 409,
    code: "SUITABILITY_CHECK_MISMATCH",
  });
  const check = await createSuitability({ productId: "product_bond" });
  bankingStore.clock.advance(1800000);
  await expect(
    verifiedIntent(prepareInvestment(body(check.id))),
  ).rejects.toMatchObject({
    status: 409,
    code: "SUITABILITY_CHECK_EXPIRED",
  });
  expect(bankingStore.read().investmentOrderIntents).toEqual({});
});
it.each([
  ["999.99", "INVESTMENT_AMOUNT_BELOW_MINIMUM"],
  ["25000.00", "INSUFFICIENT_FUNDS"],
  ["0.00", "INVALID_AMOUNT"],
  ["-1.00", "INVALID_AMOUNT"],
  ["1e3", "INVALID_AMOUNT"],
  ["1000.001", "INVALID_AMOUNT"],
])("rejects amount %s with %s", async (amount, code) => {
  const check = await createSuitability({ productId: "product_bond" });
  await expect(
    verifiedIntent(
      prepareInvestment({
        ...body(check.id),
        amount: { amount, currency: "CNY" },
      }),
    ),
  ).rejects.toMatchObject({ status: 422, code });
  expect(bankingStore.read().investmentOrderIntents).toEqual({});
});
it("rejects inactive account, unavailable product and mismatched currency before preparing", async () => {
  const check = await createSuitability({ productId: "product_bond" });
  await expect(
    verifiedIntent(
      prepareInvestment({ ...body(check.id), sourceAccountId: "acc_usd" }),
    ),
  ).rejects.toMatchObject({ code: "CURRENCY_MISMATCH" });
  await expect(
    verifiedIntent(
      prepareInvestment({
        ...body(check.id),
        amount: { amount: "1000.00", currency: "USD" },
      }),
    ),
  ).rejects.toMatchObject({ code: "CURRENCY_MISMATCH" });
  const state = bankingStore.read();
  state.accounts[0].status = "FROZEN";
  bankingStore.commit(state);
  await expect(
    verifiedIntent(prepareInvestment(body(check.id))),
  ).rejects.toMatchObject({
    code: "ACCOUNT_NOT_ELIGIBLE",
  });
  state.accounts[0].status = "ACTIVE";
  state.products[1].status = "UNAVAILABLE";
  bankingStore.commit(state);
  await expect(
    verifiedIntent(prepareInvestment(body(check.id))),
  ).rejects.toMatchObject({
    code: "INVESTMENT_PRODUCT_UNAVAILABLE",
  });
});
it("prepares an exact immutable snapshot without a domain mutation", async () => {
  const check = await createSuitability({ productId: "product_bond" });
  const before = bankingStore.read();
  const intent = await prepareInvestment(body(check.id));
  expect(intent).toMatchObject({
    status: "PREPARED",
    amount: { amount: "1000.00" },
    fees: { amount: "0.00" },
    totalDebit: { amount: "1000.00" },
    projectedAvailableBalance: { amount: "22810.31" },
    suitabilityCheckId: check.id,
    authorizationRequirement: "CONFIRMATION",
  });
  expect(intent.product).toEqual(before.products[1]);
  expect(intent.sourceAccount).toEqual(before.accounts[0]);
  expect(intent.suitability).toEqual(check);
  expect(intent.intentHash).toMatch(/^[a-f0-9]{64}$/);
  expect({ ...bankingStore.read(), investmentOrderIntents: {} }).toEqual(
    before,
  );
  intent.amount.amount = "2.00";
  intent.product.displayName = "Changed";
  expect((await getInvestmentIntent(intent.id)).amount.amount).toBe("1000.00");
  expect(service.intent(intent.id).product.displayName).toBe(
    "Aster Stable Bond",
  );
});
it("executes the standard order atomically across accounts, portfolio, transactions and Overview", async () => {
  const before = bankingStore.read();
  const beforeDeposits = bankingStore.accounts().totalBalance;
  const intent = await prepare();
  const receipt = await executeInvestment(
    {
      actionAuthorizationId: authorizationFor(intent),
      intentId: intent.id,
      intentHash: intent.intentHash,
    },
    "standard",
  );
  expect(receipt).toMatchObject({
    status: "COMPLETED",
    amount: { amount: "1000.00" },
    fees: { amount: "0.00" },
    reference: "ASTER-INVEST-1",
  });
  expect(await getInvestmentOrder(receipt.id)).toEqual(receipt);
  const account = await getAccount("acc_current");
  expect(account.balance.amount).toBe("22842.31");
  expect(account.availableBalance.amount).toBe("22810.31");
  expect(account.pendingAmount?.amount).toBe("32.00");
  const portfolio = await getPortfolio();
  expect(portfolio.totalValue.amount).toBe("19320.00");
  expect(
    portfolio.positions.find((p) => p.productId === "product_bond")
      ?.currentValue.amount,
  ).toBe("6320.00");
  expect(portfolio.investedAmount.amount).toBe("19100.00");
  expect(portfolio.gainLoss.amount).toBe("220.00");
  expect(portfolio.monthlyChange).toEqual(before.portfolio.monthlyChange);
  expect(portfolio.monthlyNetContributions.amount).toBe("1000.00");
  const overview = await getOverview();
  expect(overview.totalBalance.amount).toBe("35453.68");
  expect(overview.wealth?.total).toEqual(portfolio.totalValue);
  expect(overview.spending?.currentPeriod.amount.amount).toBe("4968.00");
  expect(overview.recentTransactions?.[0].id).toBe(receipt.transactionId);
  const transaction = await getTransaction(receipt.transactionId);
  expect(transaction).toMatchObject({
    accountId: "acc_current",
    type: "INVESTMENT_PURCHASE",
    category: "INVESTMENT",
    direction: "DEBIT",
    status: "COMPLETED",
    amount: { amount: "1000.00" },
    reference: receipt.reference,
  });
  expect(transaction.merchant).toBeUndefined();
  expect(transaction.counterparty).toBeUndefined();
  expect(
    (
      await getTransactions({
        type: "INVESTMENT_PURCHASE",
        category: "INVESTMENT",
      })
    ).items.map((t) => t.id),
  ).toEqual([receipt.transactionId]);
  const after = bankingStore.read();
  expect(after.transactions).toHaveLength(before.transactions.length + 1);
  expect(after.cards).toEqual(before.cards);
  expect(after.recurringPayments).toEqual(before.recurringPayments);
  expect(
    minor(account.balance.amount) - minor(account.pendingAmount!.amount),
  ).toBe(minor(account.availableBalance.amount));
  expect(
    minor(overview.totalBalance.amount) + minor(portfolio.totalValue.amount),
  ).toBe(
    minor(beforeDeposits.amount) + minor(before.portfolio.totalValue.amount),
  );
  expect(spendingSummary(after).totalSpend).toEqual(
    spendingSummary(before).totalSpend,
  );
});
it("calculates fees and cent precision exactly and excludes the whole investment debit from spending", async () => {
  const state = bankingStore.read();
  state.products[1].fees.amount = "1.23";
  bankingStore.commit(state);
  const check = await createSuitability({ productId: "product_bond" });
  const intent = await verifiedIntent(
    prepareInvestment({
      ...body(check.id),
      amount: { amount: "1000.01", currency: "CNY" },
    }),
  );
  expect(intent.totalDebit.amount).toBe("1001.24");
  const receipt = service.execute(
    {
      actionAuthorizationId: authorizationFor(intent),
      intentId: intent.id,
      intentHash: intent.intentHash,
    },
    "cent",
  );
  expect(service.portfolio().totalValue.amount).toBe("19320.01");
  expect(bankingStore.account("acc_current")?.balance.amount).toBe("22841.07");
  expect((await getTransaction(receipt.transactionId)).amount.amount).toBe(
    "1001.24",
  );
  expect(spendingSummary(bankingStore.read()).totalSpend.amount).toBe(
    "4968.00",
  );
});
it("creates a position when a suitable product has no existing holding", async () => {
  const state = bankingStore.read();
  state.portfolio.positions = state.portfolio.positions.filter(
    (p) => p.productId !== "product_bond",
  );
  bankingStore.commit(state);
  const intent = await prepare();
  service.execute(
    {
      actionAuthorizationId: authorizationFor(intent),
      intentId: intent.id,
      intentHash: intent.intentHash,
    },
    "new-position",
  );
  expect(
    service.portfolio().positions.find((p) => p.productId === "product_bond"),
  ).toMatchObject({
    currentValue: { amount: "1000.00" },
    investedAmount: { amount: "1000.00" },
    gainLoss: { amount: "0.00" },
  });
});
it("replays concurrent same-key requests, preserves receipts after expiry, rejects key reuse and duplicate intent execution", async () => {
  const intent = await prepare();
  const request = {
    actionAuthorizationId: authorizationFor(intent),
    intentId: intent.id,
    intentHash: intent.intentHash,
  };
  const [a, b] = await Promise.all([
    executeInvestment(request, "same"),
    executeInvestment(request, "same"),
  ]);
  expect(a).toEqual(b);
  bankingStore.clock.advance(3600000);
  new SecurityService(bankingStore).login({
    email: securityFixture.email,
    password: securityFixture.password,
  });
  expect(await executeInvestment(request, "same")).toEqual(a);
  await expect(
    executeInvestment({ ...request, intentHash: "other" }, "same"),
  ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" });
  await expect(executeInvestment(request, "new-key")).rejects.toMatchObject({
    code: "INVESTMENT_INTENT_ALREADY_EXECUTED",
  });
  expect(Object.keys(bankingStore.read().investmentOrders)).toHaveLength(1);
});
it("rejects hash mismatch and expiry without partial mutation", async () => {
  const intent = await prepare();
  const before = bankingStore.read();
  await expect(
    executeInvestment(
      {
        actionAuthorizationId: authorizationFor(intent),
        intentId: intent.id,
        intentHash: "bad",
      },
      "bad",
    ),
  ).rejects.toMatchObject({ code: "INVESTMENT_INTENT_HASH_MISMATCH" });
  expect(bankingStore.read()).toEqual(before);
  bankingStore.clock.advance(900000);
  expect((await getInvestmentIntent(intent.id)).status).toBe("EXPIRED");
  await expect(
    executeInvestment(
      {
        actionAuthorizationId: authorizationFor(intent),
        intentId: intent.id,
        intentHash: intent.intentHash,
      },
      "expired",
    ),
  ).rejects.toMatchObject({ code: "INVESTMENT_INTENT_EXPIRED" });
  expect(bankingStore.read()).toEqual(before);
});
it("revalidates suitability expiry even while the order intent remains unexpired", async () => {
  const check = await createSuitability({ productId: "product_bond" });
  bankingStore.clock.advance(1200000);
  const intent = await verifiedIntent(prepareInvestment(body(check.id)));
  bankingStore.clock.advance(600000);
  expect(service.intent(intent.id).status).toBe("PREPARED");
  const before = bankingStore.read();
  await expect(
    executeInvestment(
      {
        actionAuthorizationId: authorizationFor(intent),
        intentId: intent.id,
        intentHash: intent.intentHash,
      },
      "check-expired",
    ),
  ).rejects.toMatchObject({ code: "SUITABILITY_CHECK_EXPIRED" });
  expect(bankingStore.read()).toEqual(before);
});
it.each(["product", "account", "risk", "check"])(
  "rejects stale %s snapshots",
  async (field) => {
    const intent = await prepare();
    const state = bankingStore.read();
    if (field === "product") state.products[1].fees.amount = "2.00";
    if (field === "account") {
      state.accounts[0].balance.amount = "23800.00";
      state.accounts[0].availableBalance.amount = "23768.00";
    }
    if (field === "risk") state.riskProfile!.version++;
    if (field === "check")
      state.suitabilityChecks[intent.suitabilityCheckId].reasons = [
        "Changed evidence",
      ];
    bankingStore.commit(state);
    await expect(
      executeInvestment(
        {
          actionAuthorizationId: authorizationFor(intent),
          intentId: intent.id,
          intentHash: intent.intentHash,
        },
        "stale",
      ),
    ).rejects.toMatchObject({ status: 409, code: "INVESTMENT_STATE_CHANGED" });
    expect(bankingStore.read()).toEqual(state);
  },
);
it.each([
  ["unavailable", "INVESTMENT_PRODUCT_UNAVAILABLE"],
  ["inactive", "ACCOUNT_NOT_ELIGIBLE"],
  ["funds", "INSUFFICIENT_FUNDS"],
  ["unsuitable", "PRODUCT_NOT_SUITABLE"],
  ["check-deleted", "SUITABILITY_CHECK_NOT_FOUND"],
])("revalidates %s before execution", async (field, code) => {
  const intent = await prepare();
  const state = bankingStore.read();
  if (field === "unavailable") state.products[1].status = "UNAVAILABLE";
  if (field === "inactive") state.accounts[0].status = "FROZEN";
  if (field === "funds") state.accounts[0].availableBalance.amount = "1.00";
  if (field === "unsuitable")
    state.suitabilityChecks[intent.suitabilityCheckId].result = "NOT_SUITABLE";
  if (field === "check-deleted")
    delete state.suitabilityChecks[intent.suitabilityCheckId];
  bankingStore.commit(state);
  await expect(
    executeInvestment(
      {
        actionAuthorizationId: authorizationFor(intent),
        intentId: intent.id,
        intentHash: intent.intentHash,
      },
      "revalidate",
    ),
  ).rejects.toMatchObject({ code });
  expect(bankingStore.read()).toEqual(state);
});
it("invalidates a prepared investment after a real transfer changes its source balance", async () => {
  const intent = await prepare();
  const transfers = new TransferService(bankingStore);
  const transfer = await verifiedIntent(
    transfers.prepare({
      sourceAccountId: "acc_current",
      recipientId: "recipient_zhang",
      amount: { amount: "500.00", currency: "CNY" },
    }),
  );
  transfers.execute(
    {
      actionAuthorizationId: authorizationFor(transfer),
      intentId: transfer.id,
      intentHash: transfer.intentHash,
    },
    "transfer",
  );
  await expect(
    executeInvestment(
      {
        actionAuthorizationId: authorizationFor(intent),
        intentId: intent.id,
        intentHash: intent.intentHash,
      },
      "stale-transfer",
    ),
  ).rejects.toMatchObject({ code: "INVESTMENT_STATE_CHANGED" });
  expect(service.portfolio().totalValue.amount).toBe("18320.00");
});
it("handles all missing resources and missing/expired risk profile", async () => {
  await expect(getProduct("missing")).rejects.toMatchObject({
    status: 404,
    code: "INVESTMENT_PRODUCT_NOT_FOUND",
  });
  await expect(getSuitability("__proto__")).rejects.toMatchObject({
    status: 404,
    code: "SUITABILITY_CHECK_NOT_FOUND",
  });
  await expect(getInvestmentIntent("__proto__")).rejects.toMatchObject({
    status: 404,
    code: "INVESTMENT_INTENT_NOT_FOUND",
  });
  await expect(getInvestmentOrder("__proto__")).rejects.toMatchObject({
    status: 404,
    code: "INVESTMENT_ORDER_NOT_FOUND",
  });
  await expect(
    executeInvestment({ intentId: "missing", intentHash: "hash" }, "key"),
  ).rejects.toMatchObject({ code: "INVESTMENT_INTENT_NOT_FOUND" });
  const state = bankingStore.read();
  state.riskProfile!.expiresAt = bankingStore.clock.now();
  bankingStore.commit(state);
  await expect(getRiskProfile()).rejects.toMatchObject({
    code: "RISK_PROFILE_EXPIRED",
  });
  state.riskProfile = null;
  bankingStore.commit(state);
  await expect(getRiskProfile()).rejects.toMatchObject({
    status: 404,
    code: "RISK_PROFILE_NOT_FOUND",
  });
});
it("rejects injected execution terms or missing key and rolls back persistence failure", async () => {
  const intent = await prepare();
  const request = {
    actionAuthorizationId: authorizationFor(intent),
    intentId: intent.id,
    intentHash: intent.intentHash,
  };
  expect(() =>
    service.execute(
      { ...request, amount: { amount: "1.00", currency: "CNY" } },
      "key",
    ),
  ).toThrow();
  expect(() => service.execute(request, null)).toThrow();
  const before = bankingStore.read(),
    time = bankingStore.clock.now();
  const spy = vi.spyOn(bankingStore, "commit").mockImplementationOnce(() => {
    throw new Error("Unavailable");
  });
  await expect(executeInvestment(request, "atomic")).rejects.toMatchObject({
    status: 500,
    code: "PERSISTENCE_UNAVAILABLE",
  });
  expect(bankingStore.read()).toEqual(before);
  expect(bankingStore.clock.now()).toBe(time);
  spy.mockRestore();
  expect((await executeInvestment(request, "atomic")).status).toBe("COMPLETED");
});
it("persists investment resources, resets independently and migrates M6 without losing recurring mutations", async () => {
  let saved: string | null = null;
  const storage = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  const local = new MockBankingStore();
  local.enablePersistence(storage);
  const wealth = new WealthService(local);
  const check = wealth.createCheck({ productId: "product_bond" });
  const intent = await verifiedIntent(wealth.prepare(body(check.id)), local);
  const receipt = wealth.execute(
    {
      actionAuthorizationId: authorizationFor(intent),
      intentId: intent.id,
      intentHash: intent.intentHash,
    },
    "persist",
  );
  const restored = new MockBankingStore();
  restored.enablePersistence(storage);
  expect(new WealthService(restored).order(receipt.id)).toEqual(receipt);
  expect(restored.read().portfolio.totalValue.amount).toBe("19320.00");
  restored.reset();
  expect(restored.read().portfolio.totalValue.amount).toBe("18320.00");
  expect(restored.read().investmentOrders).toEqual({});
  expect(local.read().portfolio.totalValue.amount).toBe("19320.00");
  const recurring = new RecurringService(bankingStore);
  const stop = await verifiedIntent(
    recurring.prepare({
      recurringPaymentId: "rec_netflix",
      actionType: "STOP_FUTURE_PAYMENTS",
    }),
  );
  recurring.execute(
    {
      actionAuthorizationId: authorizationFor(stop),
      intentId: stop.id,
      intentHash: stop.intentHash,
    },
    "stop",
  );
  const legacy: Record<string, unknown> = {
    ...bankingStore.read(),
    version: 6,
  };
  for (const key of [
    "portfolio",
    "products",
    "riskProfile",
    "suitabilityChecks",
    "investmentOrderIntents",
    "investmentOrders",
    "investmentIdempotency",
    "investmentSequence",
  ])
    delete legacy[key];
  saved = JSON.stringify(legacy);
  const migrated = new MockBankingStore();
  migrated.enablePersistence(storage);
  expect(migrated.read().version).toBe(8);
  expect(new RecurringService(migrated).detail("rec_netflix").status).toBe(
    "STOPPED",
  );
  expect(migrated.read().portfolio.totalValue.amount).toBe("18320.00");
  expect(migrated.accounts()).toEqual(bankingStore.accounts());
});
