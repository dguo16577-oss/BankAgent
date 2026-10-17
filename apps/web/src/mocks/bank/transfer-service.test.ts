import { verifiedIntent, authorizationFor } from "@/test/verification";
import { SecurityService } from "./security-service";
import { securityFixture } from "../data/security-fixture";
import { demoTransactions } from "@/mocks/data/demo-profile";
import { beforeEach, expect, it, vi } from "vitest";
import { bankingStore, MockBankingStore, type BankingState } from "./store";
import { BankingError, TransferService } from "./transfer-service";
import {
  createIntent,
  executeTransfer,
  getIntent,
  getRecipients,
  getTransfer,
  type CreateIntentRequest,
  type TransferIntent,
} from "@/lib/api/payments";
import { getAccounts } from "@/lib/api/accounts";
import { getOverview } from "@/lib/api/overview";
import { getTransaction, getTransactions } from "@/lib/api/transactions";
const request: CreateIntentRequest = {
  sourceAccountId: "acc_current",
  recipientId: "recipient_zhang",
  amount: { amount: "500.00", currency: "CNY" },
  note: "Family expenses",
};
const executeBody = (intent: TransferIntent) => ({
  actionAuthorizationId: authorizationFor(intent),
  intentId: intent.id,
  intentHash: intent.intentHash,
});
let service: TransferService;
beforeEach(() => {
  service = new TransferService(bankingStore);
});
it("searches recipients through the API and exposes only masked identifiers", async () => {
  expect((await getRecipients()).items).toHaveLength(3);
  const result = await getRecipients("ZHANG");
  expect(result.items).toHaveLength(1);
  expect(result.items[0].maskedAccountNumber).toBe("•••• 6018");
  expect(result.items[0].phoneMasked).toBe("138****8000");
  expect((await getRecipients("+86 138 0013 8000")).items[0].id).toBe(
    "recipient_zhang",
  );
  expect((await getRecipients("1380013800")).items).toHaveLength(0);
  expect(JSON.stringify(result)).not.toMatch(/\b\d{8,}\b/);
});
it("prepares immutable exact terms without changing balances, transactions or asOf", async () => {
  const before = bankingStore.read();
  const intent = await verifiedIntent(createIntent(request));
  expect(intent).toMatchObject({
    status: "PREPARED",
    amount: request.amount,
    fee: { amount: "0.00" },
    totalDebit: request.amount,
    projectedAvailableBalance: { amount: "23310.31" },
    note: "Family expenses",
  });
  expect(intent.intentHash).toMatch(/^[a-f0-9]{64}$/);
  expect(await getIntent(intent.id)).toEqual(intent);
  const after = bankingStore.read();
  expect(after.accounts).toEqual(before.accounts);
  expect(after.transactions).toEqual(before.transactions);
  expect(after.asOf).toEqual(before.asOf);
  expect(after.transfers).toEqual({});
  intent.amount.amount = "1.00";
  expect((await getIntent(intent.id)).amount.amount).toBe("500.00");
});
it("atomically executes the standard 500 CNY scenario across all APIs without changing spending", async () => {
  const intent = await verifiedIntent(createIntent(request));
  const before = await getOverview();
  expect(before.totalBalance.amount).toBe("36453.68");
  const receipt = await executeTransfer(executeBody(intent), "standard-case");
  const account = (await getAccounts()).accounts.find(
    (item) => item.id === "acc_current",
  )!;
  expect(account.balance.amount).toBe("23342.31");
  expect(account.availableBalance.amount).toBe("23310.31");
  expect(account.pendingAmount?.amount).toBe("32.00");
  const overview = await getOverview();
  expect(overview.totalBalance.amount).toBe("35953.68");
  expect(overview.spending?.currentPeriod.amount).toEqual(
    before.spending?.currentPeriod.amount,
  );
  expect(overview.spending?.comparisonPeriod.amount).toEqual(
    before.spending?.comparisonPeriod.amount,
  );
  expect(overview.spending?.trend).toEqual(before.spending?.trend);
  expect(overview.spending?.currentPeriod.amount.amount).toBe("4968.00");
  const transaction = await getTransaction(receipt.transactionId);
  expect(transaction).toMatchObject({
    amount: request.amount,
    type: "BANK_TRANSFER",
    category: "TRANSFER",
    direction: "DEBIT",
    status: "COMPLETED",
    counterparty: { name: "Zhang San", maskedAccountNumber: "•••• 6018" },
    reference: receipt.reference,
    occurredAt: receipt.completedAt,
    bookedAt: receipt.completedAt,
  });
  expect(transaction.account).toEqual(account);
  expect(overview.recentTransactions?.[0].id).toBe(transaction.id);
  expect(overview.asOf).toBe(receipt.completedAt);
  expect(await getTransfer(receipt.id)).toEqual(receipt);
  expect((await getIntent(intent.id)).status).toBe("EXECUTED");
  expect((await getTransactions({ type: "BANK_TRANSFER" })).items[0].id).toBe(
    transaction.id,
  );
});
it("serializes concurrent confirmations and returns one receipt for the same key/body", async () => {
  const intent = await verifiedIntent(createIntent(request));
  const body = executeBody(intent);
  const receipts = await Promise.all(
    Array.from({ length: 5 }, () => executeTransfer(body, "same-key")),
  );
  expect(receipts.every((value) => value.id === receipts[0].id)).toBe(true);
  expect(bankingStore.read().transactions).toHaveLength(
    demoTransactions.length + 1,
  );
  expect(bankingStore.read().sequence).toBe(1);
  expect(await executeTransfer(body, "same-key")).toEqual(receipts[0]);
  await expect(
    executeTransfer({ ...body, intentHash: "changed" }, "same-key"),
  ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" });
  await expect(executeTransfer(body, "another-key")).rejects.toMatchObject({
    status: 409,
    code: "TRANSFER_INTENT_ALREADY_EXECUTED",
  });
  bankingStore.clock.advance(24 * 60 * 60 * 1000);
  new SecurityService(bankingStore).login({
    email: securityFixture.email,
    password: securityFixture.password,
  });
  await expect(executeTransfer(body, "same-key")).rejects.toMatchObject({
    status: 403,
    code: "TRANSFER_SESSION_MISMATCH",
  });
});
it.each(["0.00", "-1.00", "1.001", "NaN", "1e3", "1000000000000.00"])(
  "rejects invalid amount %s without mutation",
  async (amount) => {
    const before = bankingStore.read();
    await expect(
      verifiedIntent(
        createIntent({ ...request, amount: { amount, currency: "CNY" } }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_AMOUNT", status: 422 });
    expect(bankingStore.read()).toEqual(before);
  },
);
it.each([
  [{ sourceAccountId: "missing" }, "ACCOUNT_NOT_FOUND", 404],
  [{ recipientId: "missing" }, "RECIPIENT_NOT_FOUND", 404],
  [{ sourceAccountId: "acc_usd" }, "CURRENCY_MISMATCH", 422],
  [
    { amount: { amount: "99999.00", currency: "CNY" } },
    "INSUFFICIENT_FUNDS",
    422,
  ],
] as const)("rejects prepare precondition %j", async (change, code, status) => {
  const before = bankingStore.read();
  await expect(
    verifiedIntent(createIntent({ ...request, ...change })),
  ).rejects.toMatchObject({
    code,
    status,
  });
  expect(bankingStore.read()).toEqual(before);
});
it("rejects missing idempotency keys and extra execution fields", async () => {
  const intent = await verifiedIntent(createIntent(request));
  const before = bankingStore.read();
  for (const [body, key] of [
    [executeBody(intent), null],
    [{ ...executeBody(intent), amount: request.amount }, "key"],
  ] as const) {
    const response = await fetch("/customer/transfers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(400);
  }
  expect(bankingStore.read()).toEqual(before);
});
it("rejects hash mismatch and expiration with no partial mutation", async () => {
  const intent = await verifiedIntent(createIntent(request));
  const before = bankingStore.read();
  await expect(
    executeTransfer(
      {
        actionAuthorizationId: authorizationFor(intent),
        intentId: intent.id,
        intentHash: "wrong",
      },
      "hash-key",
    ),
  ).rejects.toMatchObject({
    code: "TRANSFER_INTENT_HASH_MISMATCH",
    status: 409,
  });
  expect(bankingStore.read()).toEqual(before);
  bankingStore.clock.advance(15 * 60 * 1000);
  expect((await getIntent(intent.id)).status).toBe("EXPIRED");
  await expect(
    executeTransfer(executeBody(intent), "expired-key"),
  ).rejects.toMatchObject({ code: "TRANSFER_INTENT_EXPIRED", status: 409 });
  expect(bankingStore.read()).toEqual(before);
});
const staleCases: [string, (state: BankingState) => void, string][] = [
  [
    "missing account",
    (state) => {
      state.accounts = state.accounts.filter(
        (item) => item.id !== "acc_current",
      );
    },
    "ACCOUNT_NOT_FOUND",
  ],
  [
    "restricted account",
    (state) => {
      state.accounts[0].status = "RESTRICTED";
    },
    "ACCOUNT_NOT_ELIGIBLE",
  ],
  [
    "missing recipient",
    (state) => {
      state.recipients = [];
    },
    "RECIPIENT_NOT_FOUND",
  ],
  [
    "invalid recipient",
    (state) => {
      state.invalidRecipientIds.push("recipient_zhang");
    },
    "RECIPIENT_NOT_ELIGIBLE",
  ],
  [
    "changed currency",
    (state) => {
      state.recipients[0].currency = "USD";
    },
    "CURRENCY_MISMATCH",
  ],
  [
    "changed recipient details",
    (state) => {
      state.recipients[0].maskedAccountNumber = "•••• 9999";
    },
    "TRANSFER_INTENT_HASH_MISMATCH",
  ],
];
it.each(staleCases)(
  "revalidates %s immediately before mutation",
  async (_, mutate, code) => {
    const intent = await verifiedIntent(service.prepare(request));
    const changed = bankingStore.read();
    mutate(changed);
    bankingStore.commit(changed);
    const before = bankingStore.read();
    expect(() => service.execute(executeBody(intent), "stale-key")).toThrow(
      BankingError,
    );
    try {
      service.execute(executeBody(intent), "stale-key");
    } catch (error) {
      expect(error).toMatchObject({ code });
    }
    expect(bankingStore.read()).toEqual(before);
  },
);
it("revalidates funds after a competing transfer and preserves the first review snapshot", async () => {
  const intent = await verifiedIntent(createIntent(request));
  const competing = await verifiedIntent(
    createIntent({
      ...request,
      amount: { amount: "23500.00", currency: "CNY" },
    }),
  );
  await executeTransfer(executeBody(competing), "competing");
  expect(await getIntent(intent.id)).toEqual(intent);
  const before = bankingStore.read();
  await expect(
    executeTransfer(executeBody(intent), "stale-funds"),
  ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  expect(bankingStore.read()).toEqual(before);
});
it("has distinct resource 404 errors, including special object property names", async () => {
  for (const id of ["missing", "toString", "__proto__"]) {
    await expect(getIntent(id)).rejects.toMatchObject({
      status: 404,
      code: "TRANSFER_INTENT_NOT_FOUND",
    });
    await expect(getTransfer(id)).rejects.toMatchObject({
      status: 404,
      code: "TRANSFER_NOT_FOUND",
    });
    await expect(
      executeTransfer({ intentId: id, intentHash: "none" }, "missing"),
    ).rejects.toMatchObject({ status: 404 });
  }
});
it("persists successful resources across refresh and rejects storage failure atomically", async () => {
  const memory = new Map<string, string>();
  let broken = false;
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (broken) throw new Error("quota");
      memory.set(key, value);
    },
  } as Storage;
  const store = new MockBankingStore();
  store.enablePersistence(storage);
  new SecurityService(store).login({
    email: securityFixture.email,
    password: securityFixture.password,
  });
  const first = new TransferService(store);
  const intent = await verifiedIntent(first.prepare(request), store);
  const before = store.read();
  broken = true;
  expect(() => first.execute(executeBody(intent), "persistent-key")).toThrow(
    "No transfer was committed",
  );
  expect(store.read()).toEqual(before);
  expect(store.clock.now()).toBe(before.asOf);
  broken = false;
  const receipt = first.execute(executeBody(intent), "persistent-key");
  const restored = new MockBankingStore();
  restored.enablePersistence(storage);
  expect(new TransferService(restored).receipt(receipt.id)).toEqual(receipt);
  expect(
    new TransferService(restored).execute(
      executeBody(intent),
      "persistent-key",
    ),
  ).toEqual(receipt);
  expect(restored.read()).toEqual(store.read());
});
it("uses the injected clock and invalidates old transaction cursors after mutation", async () => {
  const page = await getTransactions({ limit: 2 });
  bankingStore.clock.advance(60_000);
  const intent = await verifiedIntent(createIntent(request));
  expect(intent.createdAt).toBe("2026-09-27T02:31:00.000Z");
  await executeTransfer(executeBody(intent), "clock-key");
  await expect(
    getTransactions({ limit: 2, cursor: page.nextCursor! }),
  ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
});
it("does not mutate state if commit fails unexpectedly", async () => {
  const intent = await verifiedIntent(service.prepare(request));
  const before = bankingStore.read();
  const spy = vi.spyOn(bankingStore, "commit").mockImplementation(() => {
    throw new Error("write failure");
  });
  expect(() => service.execute(executeBody(intent), "fail-key")).toThrow(
    "No transfer was committed",
  );
  expect(bankingStore.read()).toEqual(before);
  spy.mockRestore();
});
