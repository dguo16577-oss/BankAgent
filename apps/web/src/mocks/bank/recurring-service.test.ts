import { verifiedIntent, authorizationFor } from "@/test/verification";
import { expect, it, vi } from "vitest";
import { bankingStore, MockBankingStore } from "./store";
import { RecurringService } from "./recurring-service";
import { spendingSummary } from "./spending-analytics";
import {
  prepareRecurringAction,
  executeRecurringAction,
  getRecurringPayment,
  getRecurringIntent,
  getRecurringAction,
  getRecurringPayments,
} from "@/lib/api/spending";
const service = new RecurringService(bankingStore);
const prepare = () =>
  verifiedIntent(
    prepareRecurringAction({
      recurringPaymentId: "rec_netflix",
      actionType: "STOP_FUTURE_PAYMENTS",
    }),
  );
it("exposes consistent amounts, transaction IDs, card links, capability and auditable detection", async () => {
  const list = await getRecurringPayments();
  expect(list.items).toHaveLength(6);
  for (const item of list.items) {
    const detail = await getRecurringPayment(item.id);
    expect(detail).toMatchObject(item);
    for (const id of detail.transactionHistory) {
      const transaction = bankingStore
        .read()
        .transactions.find((t) => t.id === id)!;
      expect(transaction.amount).toEqual(detail.usualAmount);
      expect(transaction.accountId).toBe(detail.sourceAccountId);
    }
    expect(JSON.stringify(detail)).not.toMatch(
      /"(?:accountNumber|cardNumber|cvv|pin|password)"/i,
    );
  }
  const detected = await getRecurringPayment("rec_bookshop");
  expect(detected).toMatchObject({
    source: "DETECTED_PATTERN",
    managementCapability: "NONE",
    detectionProvenance: { observedOccurrences: 3 },
  });
  expect(detected.detectionProvenance?.matchedTransactionIds).toEqual(
    detected.transactionHistory,
  );
  expect(detected.detectionProvenance?.firstObservedAt).toBe(
    "2026-06-24T12:00:00+08:00",
  );
  expect(await getRecurringPayment("rec_netflix")).toMatchObject({
    type: "CARD_SUBSCRIPTION",
    cardId: "card_aster_debit",
    source: "BANK_MANAGED",
    managementCapability: "STOP_FUTURE_PAYMENTS",
  });
});
it("prepares an immutable exact snapshot without changing domain state", async () => {
  const before = bankingStore.read();
  const intent = await prepareRecurringAction({
    recurringPaymentId: "rec_netflix",
    actionType: "STOP_FUTURE_PAYMENTS",
  });
  expect(intent.recurringPayment).toEqual(
    before.recurringPayments.find((p) => p.id === "rec_netflix"),
  );
  expect(intent.before).toEqual({
    status: "ACTIVE",
    nextExpectedAt: "2026-10-03T09:00:00+08:00",
    managementCapability: "STOP_FUTURE_PAYMENTS",
    version: 0,
  });
  expect(intent.after).toEqual({
    ...intent.before,
    status: "STOPPED",
    nextExpectedAt: null,
    version: 1,
  });
  expect(intent.authorizationRequirement).toBe("CONFIRMATION");
  expect(intent.intentHash).toMatch(/^[a-f0-9]{64}$/);
  expect(intent.effectDescription).toContain(
    "Block future recurring merchant payments",
  );
  const after = bankingStore.read();
  expect({ ...after, recurringPaymentActionIntents: {} }).toEqual(before);
  intent.recurringPayment.displayName = "Tampered";
  expect(
    (await getRecurringIntent(intent.id)).recurringPayment.displayName,
  ).toBe("Netflix");
});
it("stops atomically, removes future Netflix only and preserves all financial history", async () => {
  const before = bankingStore.read();
  const spending = spendingSummary(before);
  expect(
    bankingStore
      .overview()
      .upcomingPayments?.some((p) => p.title === "Netflix"),
  ).toBe(true);
  const intent = await prepare();
  const receipt = await executeRecurringAction(
    {
      actionAuthorizationId: authorizationFor(intent),
      intentId: intent.id,
      intentHash: intent.intentHash,
    },
    "stop-netflix",
  );
  expect(receipt).toMatchObject({
    status: "COMPLETED",
    after: { status: "STOPPED", nextExpectedAt: null },
    reference: "ASTER-RECURRING-1",
  });
  expect(await getRecurringAction(receipt.id)).toEqual(receipt);
  expect(await getRecurringPayment("rec_netflix")).toMatchObject({
    status: "STOPPED",
    nextExpectedAt: null,
  });
  expect(
    bankingStore
      .overview()
      .upcomingPayments?.some((p) => p.title === "Netflix"),
  ).toBe(false);
  const after = bankingStore.read();
  for (const key of [
    "transactions",
    "accounts",
    "cards",
    "overview",
    "asOf",
    "revision",
  ] as const)
    expect(after[key]).toEqual(before[key]);
  expect(spendingSummary(after)).toEqual(spending);
});
it("replays exact receipts after expiry, rejects changed requests and another execution key", async () => {
  const intent = await prepare();
  const body = {
    actionAuthorizationId: authorizationFor(intent),
    intentId: intent.id,
    intentHash: intent.intentHash,
  };
  const receipt = await executeRecurringAction(body, "same");
  bankingStore.clock.advance(900001);
  expect(await executeRecurringAction(body, "same")).toEqual(receipt);
  await expect(
    executeRecurringAction({ ...body, intentHash: "changed" }, "same"),
  ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" });
  await expect(executeRecurringAction(body, "another")).rejects.toMatchObject({
    status: 409,
    code: "RECURRING_PAYMENT_INTENT_ALREADY_EXECUTED",
  });
  expect(Object.keys(bankingStore.read().recurringPaymentActions)).toHaveLength(
    1,
  );
});
it("rejects mismatched hashes without mutation and exposes expired intent", async () => {
  const intent = await prepare();
  const before = bankingStore.read();
  await expect(
    executeRecurringAction(
      {
        actionAuthorizationId: authorizationFor(intent),
        intentId: intent.id,
        intentHash: "bad",
      },
      "bad",
    ),
  ).rejects.toMatchObject({
    status: 409,
    code: "RECURRING_PAYMENT_INTENT_HASH_MISMATCH",
  });
  expect(bankingStore.read()).toEqual(before);
  bankingStore.clock.advance(900000);
  expect((await getRecurringIntent(intent.id)).status).toBe("EXPIRED");
  await expect(
    executeRecurringAction(
      {
        actionAuthorizationId: authorizationFor(intent),
        intentId: intent.id,
        intentHash: intent.intentHash,
      },
      "expired",
    ),
  ).rejects.toMatchObject({
    status: 409,
    code: "RECURRING_PAYMENT_INTENT_EXPIRED",
  });
  expect(bankingStore.read()).toEqual(before);
});
it.each(["status", "capability", "amount", "schedule", "version"])(
  "rejects stale %s and commits no partial action",
  async (field) => {
    const intent = await prepare();
    const changed = bankingStore.read();
    const payment = changed.recurringPayments.find(
      (p) => p.id === "rec_netflix",
    )!;
    if (field === "status") payment.status = "STOPPED";
    if (field === "capability") payment.managementCapability = "NONE";
    if (field === "amount") payment.usualAmount.amount = "89.00";
    if (field === "schedule")
      payment.nextExpectedAt = "2026-10-04T09:00:00+08:00";
    if (field === "version") payment.version++;
    bankingStore.commit(changed);
    await expect(
      executeRecurringAction(
        {
          actionAuthorizationId: authorizationFor(intent),
          intentId: intent.id,
          intentHash: intent.intentHash,
        },
        "stale",
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "RECURRING_PAYMENT_STATE_CHANGED",
    });
    expect(bankingStore.read()).toEqual(changed);
  },
);
it("rejects detected-only and already stopped records; rejects changed capability during prepare/execute", async () => {
  await expect(
    verifiedIntent(
      prepareRecurringAction({
        recurringPaymentId: "rec_bookshop",
        actionType: "STOP_FUTURE_PAYMENTS",
      }),
    ),
  ).rejects.toMatchObject({
    status: 422,
    code: "RECURRING_PAYMENT_NOT_MANAGEABLE",
  });
  const intent = await prepare();
  await executeRecurringAction(
    {
      actionAuthorizationId: authorizationFor(intent),
      intentId: intent.id,
      intentHash: intent.intentHash,
    },
    "stopped",
  );
  await expect(prepare()).rejects.toMatchObject({
    status: 409,
    code: "RECURRING_PAYMENT_ALREADY_STOPPED",
  });
});
it("defines type-specific bank-side effects for direct debit and standing orders", async () => {
  const request = {
    recurringPaymentId: "rec_rent",
    actionType: "STOP_FUTURE_PAYMENTS" as const,
  };
  expect(
    (await verifiedIntent(prepareRecurringAction(request))).effectDescription,
  ).toContain("Revoke the bank-side direct debit mandate");
  const state = bankingStore.read();
  state.recurringPayments.find((p) => p.id === "rec_rent")!.type =
    "STANDING_ORDER";
  bankingStore.commit(state);
  expect(
    (await verifiedIntent(prepareRecurringAction(request))).effectDescription,
  ).toContain("Cancel future scheduled bank payments");
});
it("returns typed 404s including prototype names and revalidates existence at execution", async () => {
  await expect(getRecurringPayment("missing")).rejects.toMatchObject({
    status: 404,
    code: "RECURRING_PAYMENT_NOT_FOUND",
  });
  await expect(getRecurringIntent("__proto__")).rejects.toMatchObject({
    status: 404,
    code: "RECURRING_PAYMENT_INTENT_NOT_FOUND",
  });
  await expect(getRecurringAction("__proto__")).rejects.toMatchObject({
    status: 404,
    code: "RECURRING_PAYMENT_ACTION_NOT_FOUND",
  });
  await expect(
    executeRecurringAction({ intentId: "missing", intentHash: "hash" }, "key"),
  ).rejects.toMatchObject({
    status: 404,
    code: "RECURRING_PAYMENT_INTENT_NOT_FOUND",
  });
  const intent = await prepare();
  const state = bankingStore.read();
  state.recurringPayments = state.recurringPayments.filter(
    (p) => p.id !== "rec_netflix",
  );
  bankingStore.commit(state);
  await expect(
    executeRecurringAction(
      {
        actionAuthorizationId: authorizationFor(intent),
        intentId: intent.id,
        intentHash: intent.intentHash,
      },
      "removed",
    ),
  ).rejects.toMatchObject({ status: 404, code: "RECURRING_PAYMENT_NOT_FOUND" });
});
it("rejects injected executable terms and missing idempotency keys", async () => {
  const intent = await prepare();
  const body = {
    actionAuthorizationId: authorizationFor(intent),
    intentId: intent.id,
    intentHash: intent.intentHash,
  };
  expect(() =>
    service.execute({ ...body, status: "STOPPED" }, "key"),
  ).toThrow();
  expect(() => service.execute(body, null)).toThrow();
  await expect(
    verifiedIntent(
      service.prepare({
        recurringPaymentId: "rec_netflix",
        actionType: "RESTART",
      }),
    ),
  ).rejects.toMatchObject({ status: 400 });
});
it("rolls back persistence failure and can safely retry with the same key", async () => {
  const intent = await prepare();
  const before = bankingStore.read();
  const time = bankingStore.clock.now();
  const spy = vi.spyOn(bankingStore, "commit").mockImplementationOnce(() => {
    throw new Error("Disk unavailable");
  });
  const body = {
    actionAuthorizationId: authorizationFor(intent),
    intentId: intent.id,
    intentHash: intent.intentHash,
  };
  await expect(executeRecurringAction(body, "atomic")).rejects.toMatchObject({
    status: 500,
    code: "PERSISTENCE_UNAVAILABLE",
  });
  expect(bankingStore.read()).toEqual(before);
  expect(bankingStore.clock.now()).toBe(time);
  spy.mockRestore();
  expect((await executeRecurringAction(body, "atomic")).after.status).toBe(
    "STOPPED",
  );
});
it("persists receipts and stopped state across reload, with isolated reset and legacy migration", async () => {
  let saved: string | null = null;
  const storage = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  const local = new MockBankingStore();
  local.enablePersistence(storage);
  const actions = new RecurringService(local);
  const intent = await verifiedIntent(
    actions.prepare({
      recurringPaymentId: "rec_netflix",
      actionType: "STOP_FUTURE_PAYMENTS",
    }),
    local,
  );
  const receipt = actions.execute(
    {
      actionAuthorizationId: authorizationFor(intent),
      intentId: intent.id,
      intentHash: intent.intentHash,
    },
    "persist",
  );
  const restored = new MockBankingStore();
  restored.enablePersistence(storage);
  expect(new RecurringService(restored).receipt(receipt.id)).toEqual(receipt);
  expect(
    restored.read().recurringPayments.find((p) => p.id === "rec_netflix")!
      .status,
  ).toBe("STOPPED");
  restored.reset();
  expect(new RecurringService(restored).detail("rec_netflix").status).toBe(
    "ACTIVE",
  );
  expect(restored.read().recurringPaymentActions).toEqual({});
  expect(actions.detail("rec_netflix").status).toBe("STOPPED");
  saved = JSON.stringify({ ...bankingStore.read(), version: 5 });
  const migrated = new MockBankingStore();
  migrated.enablePersistence(storage);
  expect(migrated.read().version).toBe(8);
  expect(migrated.read().recurringPayments).toHaveLength(6);
  expect(migrated.accounts()).toEqual(bankingStore.accounts());
});
