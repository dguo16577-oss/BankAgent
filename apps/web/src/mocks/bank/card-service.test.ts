import { verifiedIntent, authorizationFor } from "@/test/verification";
import { SecurityService } from "./security-service";
import { securityFixture } from "../data/security-fixture";
import { demoTransactions } from "@/mocks/data/demo-profile";
import { beforeEach, expect, it, vi } from "vitest";
import { bankingStore, MockBankingStore, type BankingState } from "./store";
import { CardService, classifyCardChange } from "./card-service";
import { TransferService } from "./transfer-service";
import {
  getCards,
  getCard,
  prepareCardAction,
  getCardIntent,
  executeCardAction,
  getCardAction,
  type CardActionIntent,
} from "@/lib/api/cards";
import { getOverview } from "@/lib/api/overview";
import { getAccounts } from "@/lib/api/accounts";
import { getTransaction, getTransactions } from "@/lib/api/transactions";
const cardId = "card_aster_debit";
const reference = (intent: CardActionIntent) => ({
  actionAuthorizationId: authorizationFor(intent),
  intentId: intent.id,
  intentHash: intent.intentHash,
});
let service: CardService;
beforeEach(() => {
  service = new CardService(bankingStore);
});
function unchangedFinancial(before: BankingState) {
  const after = bankingStore.read();
  for (const key of [
    "accounts",
    "transactions",
    "overview",
    "asOf",
    "revision",
    "transfers",
    "intents",
    "idempotency",
    "sequence",
    "recipients",
  ] as const)
    expect(after[key]).toEqual(before[key]);
}
it("lists masked card summaries and a detail linked to the shared account", async () => {
  const cards = await getCards();
  expect(cards.items).toHaveLength(2);
  expect(cards.items[0]).toMatchObject({
    displayName: "Visa Debit",
    maskedNumber: "••8821",
    status: "ACTIVE",
    linkedAccount: { id: "acc_current" },
  });
  const card = await getCard(cardId);
  expect(card.controls).toEqual({
    onlinePayments: true,
    internationalPayments: true,
    atmWithdrawals: true,
    contactless: true,
  });
  expect(card.version).toBe(0);
  expect(JSON.stringify([card, cards])).not.toMatch(
    /"(?:pan|fullPan|cardNumber|last4|cvv|pin|password)"/i,
  );
  expect(JSON.stringify([card, cards])).not.toMatch(/\b\d{8,}\b/);
});
it("filters card activity on the API, combines filters and paginates without loss", async () => {
  const expected = bankingStore
    .read()
    .transactions.filter((item) => item.cardId === cardId);
  expect(expected.length).toBeGreaterThan(5);
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await getTransactions({ cardId, limit: 2, cursor });
    expect(
      page.items.every(
        (item) => item.cardId === cardId && item.cardMaskedNumber === "••8821",
      ),
    ).toBe(true);
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  expect(new Set(ids).size).toBe(expected.length);
  expect([...ids].sort()).toEqual(expected.map((item) => item.id).sort());
  const pending = await getTransactions({
    cardId,
    status: "PENDING",
    accountId: "acc_current",
  });
  expect(pending.items.map((item) => item.id)).toEqual(["txn_coffee"]);
  expect((await getTransaction("txn_coffee")).cardId).toBe(cardId);
  expect(
    (await getTransactions({ cardId: "card_aster_credit" })).items,
  ).toEqual([]);
  const first = await getTransactions({ cardId, limit: 2 });
  await expect(
    getTransactions({
      cardId: "card_aster_credit",
      limit: 2,
      cursor: first.nextCursor!,
    }),
  ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
});
it("prepares an exact immutable freeze snapshot without financial or card mutation", async () => {
  const before = bankingStore.read();
  const intent = await verifiedIntent(
    prepareCardAction({ cardId, actionType: "FREEZE" }),
  );
  expect(intent).toMatchObject({
    actionType: "FREEZE",
    status: "PREPARED",
    card: { id: cardId, maskedNumber: "••8821" },
    before: { status: "ACTIVE", version: 0 },
    after: { status: "FROZEN", version: 1 },
    riskDirection: "PROTECTIVE",
    authorizationRequirement: "CONFIRMATION",
  });
  expect(intent.before.controls).toEqual(intent.after.controls);
  expect(await getCardIntent(intent.id)).toEqual(intent);
  expect(intent.intentHash).toMatch(/^[0-9a-f]{64}$/);
  unchangedFinancial(before);
  expect(bankingStore.read().cards).toEqual(before.cards);
  intent.before.controls.onlinePayments = false;
  intent.card.displayName = "changed";
  const saved = await getCardIntent(intent.id);
  expect(saved.before.controls.onlinePayments).toBe(true);
  expect(saved.card.displayName).toBe("Visa Debit");
});
it("Scenario A freezes atomically while all account, pending, transaction, spending and wealth data remain unchanged", async () => {
  const before = bankingStore.read();
  const accounts = await getAccounts();
  const overview = await getOverview();
  const activity = await getTransactions({ cardId, limit: 50 });
  const intent = await verifiedIntent(
    prepareCardAction({ cardId, actionType: "FREEZE" }),
  );
  const receipt = await executeCardAction(reference(intent), "freeze");
  expect((await getCard(cardId)).status).toBe("FROZEN");
  expect((await getCardIntent(intent.id)).status).toBe("EXECUTED");
  expect(receipt).toMatchObject({
    status: "COMPLETED",
    before: intent.before,
    after: intent.after,
    card: { status: "FROZEN" },
  });
  expect(await getCardAction(receipt.id)).toEqual(receipt);
  expect(await getAccounts()).toEqual(accounts);
  expect(await getTransactions({ cardId, limit: 50 })).toEqual(activity);
  unchangedFinancial(before);
  const updated = await getOverview();
  expect({ ...updated, cards: overview.cards }).toEqual(overview);
  expect(updated.cards?.find((card) => card.id === cardId)?.status).toBe(
    "FROZEN",
  );
  expect(bankingStore.clock.now()).toBe(receipt.completedAt);
  expect((await getCard(cardId)).updatedAt).toBe(receipt.completedAt);
});
it("deduplicates parallel requests, rejects conflicting key reuse and duplicate intents", async () => {
  const intent = await verifiedIntent(
    prepareCardAction({ cardId, actionType: "FREEZE" }),
  );
  const receipts = await Promise.all(
    Array.from({ length: 4 }, () =>
      executeCardAction(reference(intent), "freeze-retry"),
    ),
  );
  expect(receipts.every((item) => item.id === receipts[0].id)).toBe(true);
  expect(Object.keys(bankingStore.read().cardActions)).toHaveLength(1);
  expect((await getCard(cardId)).version).toBe(1);
  bankingStore.clock.advance(60 * 60 * 1000);
  new SecurityService(bankingStore).login({
    email: securityFixture.email,
    password: securityFixture.password,
  });
  expect(await executeCardAction(reference(intent), "freeze-retry")).toEqual(
    receipts[0],
  );
  await expect(
    executeCardAction(
      { ...reference(intent), intentHash: "different" },
      "freeze-retry",
    ),
  ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" });
  await expect(
    executeCardAction(reference(intent), "another-key"),
  ).rejects.toMatchObject({
    status: 409,
    code: "CARD_ACTION_INTENT_ALREADY_EXECUTED",
  });
});
it("Scenario B executes protective control changes without changing any financial data", async () => {
  const before = bankingStore.read();
  const controls = (await getCard(cardId)).controls;
  const intent = await verifiedIntent(
    prepareCardAction({
      cardId,
      actionType: "UPDATE_CONTROLS",
      controls: { ...controls, onlinePayments: false },
    }),
  );
  expect(intent).toMatchObject({
    riskDirection: "PROTECTIVE",
    authorizationRequirement: "CONFIRMATION",
    before: { controls: { onlinePayments: true } },
    after: { controls: { onlinePayments: false } },
  });
  await executeCardAction(reference(intent), "controls-off");
  expect((await getCard(cardId)).controls.onlinePayments).toBe(false);
  unchangedFinancial(before);
});
it("Scenario C blocks OFF to ON at service and HTTP layers, including fake authorization attempts", async () => {
  const controls = (await getCard(cardId)).controls;
  const off = await verifiedIntent(
    prepareCardAction({
      cardId,
      actionType: "UPDATE_CONTROLS",
      controls: { ...controls, onlinePayments: false },
    }),
  );
  await executeCardAction(reference(off), "disable");
  const intent = await verifiedIntent(
    prepareCardAction({
      cardId,
      actionType: "UPDATE_CONTROLS",
      controls,
    }),
  );
  expect(intent).toMatchObject({
    riskDirection: "RISK_INCREASING",
    authorizationRequirement: "STEP_UP_AUTH",
  });
  const before = bankingStore.read();
  await expect(
    executeCardAction(reference(intent), "enable"),
  ).rejects.toMatchObject({ status: 403, code: "STEP_UP_AUTH_REQUIRED" });
  expect(() => service.execute(reference(intent), "direct")).toThrow(
    "Additional verification required",
  );
  const response = await fetch("/customer/card-actions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "fake-proof",
      "X-Step-Up-Verified": "true",
    },
    body: JSON.stringify(reference(intent)),
  });
  expect(response.status).toBe(403);
  expect(bankingStore.read()).toEqual(before);
});
it("blocks unfreeze and prioritizes risk-increasing changes in a mixed control request", async () => {
  const freeze = await verifiedIntent(
    service.prepare({ cardId, actionType: "FREEZE" }),
  );
  service.execute(reference(freeze), "freeze");
  const unfreeze = await verifiedIntent(
    service.prepare({ cardId, actionType: "UNFREEZE" }),
  );
  expect(unfreeze.authorizationRequirement).toBe("STEP_UP_AUTH");
  expect(() => service.execute(reference(unfreeze), "unfreeze")).toThrow(
    "Additional verification required",
  );
  const controls = service.card(cardId).controls;
  const off = await verifiedIntent(
    service.prepare({
      cardId,
      actionType: "UPDATE_CONTROLS",
      controls: { ...controls, onlinePayments: false },
    }),
  );
  service.execute(reference(off), "off");
  const mixed = await verifiedIntent(
    service.prepare({
      cardId,
      actionType: "UPDATE_CONTROLS",
      controls: { ...controls, internationalPayments: false },
    }),
  );
  expect(mixed.riskDirection).toBe("RISK_INCREASING");
  expect(() => service.execute(reference(mixed), "mixed")).toThrow(
    "Additional verification required",
  );
});
it("rejects stale status, controls and ABA version changes without partial mutation", async () => {
  const freeze = await verifiedIntent(
    prepareCardAction({ cardId, actionType: "FREEZE" }),
  );
  const off = await verifiedIntent(
    prepareCardAction({
      cardId,
      actionType: "UPDATE_CONTROLS",
      controls: { ...freeze.before.controls, contactless: false },
    }),
  );
  await executeCardAction(reference(off), "first-change");
  const before = bankingStore.read();
  await expect(
    executeCardAction(reference(freeze), "stale"),
  ).rejects.toMatchObject({ status: 409, code: "CARD_STATE_CHANGED" });
  expect(bankingStore.read()).toEqual(before);
  const refreshed = await verifiedIntent(
    service.prepare({ cardId, actionType: "FREEZE" }),
  );
  const changed = bankingStore.read();
  changed.cards[0].version += 2;
  bankingStore.commit(changed);
  expect(() => service.execute(reference(refreshed), "aba")).toThrow(
    "Card state changed",
  );
});
it("rejects expired intents and hash mismatches without modifying state", async () => {
  const intent = await verifiedIntent(
    prepareCardAction({ cardId, actionType: "FREEZE" }),
  );
  const before = bankingStore.read();
  await expect(
    executeCardAction({ ...reference(intent), intentHash: "wrong" }, "hash"),
  ).rejects.toMatchObject({
    status: 409,
    code: "CARD_ACTION_INTENT_HASH_MISMATCH",
  });
  expect(bankingStore.read()).toEqual(before);
  bankingStore.clock.advance(15 * 60 * 1000);
  expect((await getCardIntent(intent.id)).status).toBe("EXPIRED");
  await expect(
    executeCardAction(reference(intent), "expiry"),
  ).rejects.toMatchObject({ status: 409, code: "CARD_ACTION_INTENT_EXPIRED" });
  expect(bankingStore.read()).toEqual(before);
});
it.each(["missing", "__proto__", "toString"])(
  "returns resource 404s for %s",
  async (id) => {
    await expect(getCard(id)).rejects.toMatchObject({
      status: 404,
      code: "CARD_NOT_FOUND",
    });
    await expect(getCardIntent(id)).rejects.toMatchObject({
      status: 404,
      code: "CARD_ACTION_INTENT_NOT_FOUND",
    });
    await expect(getCardAction(id)).rejects.toMatchObject({
      status: 404,
      code: "CARD_ACTION_NOT_FOUND",
    });
    await expect(
      verifiedIntent(prepareCardAction({ cardId: id, actionType: "FREEZE" })),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      executeCardAction({ intentId: id, intentHash: "missing" }, "missing"),
    ).rejects.toMatchObject({ status: 404 });
  },
);
it("revalidates card existence at execution and rejects expired/cancelled preparation", async () => {
  const intent = await verifiedIntent(
    service.prepare({ cardId, actionType: "FREEZE" }),
  );
  const changed = bankingStore.read();
  changed.cards = [];
  bankingStore.commit(changed);
  const before = bankingStore.read();
  await expect(
    executeCardAction(reference(intent), "removed"),
  ).rejects.toMatchObject({ code: "CARD_NOT_FOUND" });
  expect(bankingStore.read()).toEqual(before);
  for (const status of ["EXPIRED", "CANCELLED"] as const) {
    bankingStore.reset();
    new SecurityService(bankingStore).login({
      email: securityFixture.email,
      password: securityFixture.password,
    });
    const state = bankingStore.read();
    state.cards[0].status = status;
    bankingStore.commit(state);
    await expect(
      verifiedIntent(service.prepare({ cardId, actionType: "FREEZE" })),
    ).rejects.toMatchObject({ status: 422, code: "CARD_NOT_ELIGIBLE" });
  }
});
it.each([
  { cardId, actionType: "FREEZE", controls: {} },
  {
    cardId,
    actionType: "UPDATE_CONTROLS",
    controls: { onlinePayments: false },
  },
  {
    cardId,
    actionType: "UPDATE_CONTROLS",
    controls: {
      onlinePayments: "false",
      internationalPayments: true,
      atmWithdrawals: true,
      contactless: true,
    },
  },
  { cardId, actionType: "FREEZE", riskDirection: "PROTECTIVE" },
  { cardId, actionType: "UNKNOWN" },
])("rejects invalid prepare body %j", async (body) => {
  const before = bankingStore.read();
  const response = await fetch("/customer/card-action-intents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(400);
  expect(bankingStore.read()).toEqual(before);
});
it("rejects no-op controls and validates execution body/key", async () => {
  const card = service.card(cardId);
  const unchanged = {
    status: card.status,
    controls: card.controls,
    version: card.version,
  };
  expect(classifyCardChange(unchanged, unchanged).riskDirection).toBe(
    "NEUTRAL",
  );
  await expect(
    verifiedIntent(
      service.prepare({
        cardId,
        actionType: "UPDATE_CONTROLS",
        controls: card.controls,
      }),
    ),
  ).rejects.toMatchObject({ code: "NO_CARD_CHANGES" });
  const intent = await verifiedIntent(
    service.prepare({ cardId, actionType: "FREEZE" }),
  );
  for (const [body, key] of [
    [reference(intent), null],
    [{ ...reference(intent), controls: card.controls }, "key"],
    [{ ...reference(intent), authorizationSatisfied: true }, "fake"],
  ] as const)
    expect(() => service.execute(body, key)).toThrowError(
      expect.objectContaining({ code: "INVALID_REQUEST" }),
    );
});
it("keeps snapshots, intent status and clock unchanged on storage failure", async () => {
  const intent = await verifiedIntent(
    service.prepare({ cardId, actionType: "FREEZE" }),
  );
  const before = bankingStore.read();
  const time = bankingStore.clock.now();
  const spy = vi.spyOn(bankingStore, "commit").mockImplementation(() => {
    throw new Error("storage quota");
  });
  expect(() => service.execute(reference(intent), "failure")).toThrow(
    "No card change was committed",
  );
  expect(bankingStore.read()).toEqual(before);
  expect(bankingStore.clock.now()).toBe(time);
  spy.mockRestore();
});
it("restores card receipts, idempotency and clock across refresh and resets in isolation", async () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
  };
  const store = new MockBankingStore();
  new SecurityService(store).login({
    email: securityFixture.email,
    password: securityFixture.password,
  });
  store.enablePersistence(storage);
  const cards = new CardService(store);
  const intent = await verifiedIntent(
    cards.prepare({ cardId, actionType: "FREEZE" }),
  );
  const receipt = cards.execute(reference(intent), "persist");
  const restored = new MockBankingStore();
  restored.enablePersistence(storage);
  expect(restored.clock.now()).toBe(receipt.completedAt);
  expect(
    new CardService(restored).execute(reference(intent), "persist"),
  ).toEqual(receipt);
  expect(restored.accounts()).toEqual(store.accounts());
  restored.reset();
  expect(new CardService(restored).card(cardId).status).toBe("ACTIVE");
  expect(Object.keys(restored.read().cardActions)).toHaveLength(0);
  expect(cards.card(cardId).status).toBe("FROZEN");
});
it("migrates an M4 session without losing completed transfers or balances", async () => {
  const transferService = new TransferService(bankingStore);
  const intent = await verifiedIntent(
    transferService.prepare({
      sourceAccountId: "acc_current",
      recipientId: "recipient_zhang",
      amount: { amount: "500.00", currency: "CNY" },
    }),
  );
  const receipt = transferService.execute(
    {
      actionAuthorizationId: authorizationFor(intent),
      intentId: intent.id,
      intentHash: intent.intentHash,
    },
    "m4",
  );
  const legacy: Record<string, unknown> = {
    ...bankingStore.read(),
    version: 4,
  };
  for (const key of [
    "cards",
    "cardIntents",
    "cardActions",
    "cardIdempotency",
    "cardSequence",
    "clockAt",
  ])
    delete legacy[key];
  const storage = {
    getItem: (key: string) =>
      key === "aster-m4-banking-state-v1" ? JSON.stringify(legacy) : null,
    setItem: () => {},
  };
  const restored = new MockBankingStore();
  restored.enablePersistence(storage);
  expect(restored.accounts().totalBalance.amount).toBe("35953.68");
  expect(new TransferService(restored).receipt(receipt.id)).toEqual(receipt);
  expect(new CardService(restored).card(cardId).status).toBe("ACTIVE");
  expect(restored.read().transactions).toHaveLength(
    demoTransactions.length + 1,
  );
});
it("uses separate domain idempotency scopes and preserves pending card activity", async () => {
  const transfer = new TransferService(bankingStore);
  const prepared = await verifiedIntent(
    transfer.prepare({
      sourceAccountId: "acc_current",
      recipientId: "recipient_zhang",
      amount: { amount: "500.00", currency: "CNY" },
    }),
  );
  transfer.execute(
    {
      actionAuthorizationId: authorizationFor(prepared),
      intentId: prepared.id,
      intentHash: prepared.intentHash,
    },
    "shared-key",
  );
  const before = bankingStore.read();
  const intent = await verifiedIntent(
    service.prepare({ cardId, actionType: "FREEZE" }),
  );
  service.execute(reference(intent), "shared-key");
  unchangedFinancial(before);
  expect(
    (await getTransactions({ cardId, status: "PENDING" })).items[0],
  ).toMatchObject({ id: "txn_coffee", amount: { amount: "32.00" } });
});
