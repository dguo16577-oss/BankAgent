import { verifiedIntent, authorizationFor } from "@/test/verification";
import { expect, it } from "vitest";
import { bankingStore } from "./store";
import { ScheduleService } from "./schedule-service";
const due = "2026-09-28T09:00:00+08:00";
async function create() {
  const service = new ScheduleService(bankingStore);
  const a = await verifiedIntent(
    service.prepare({
      actionType: "CREATE",
      sourceAccountId: "acc_current",
      recipientId: "recipient_zhang",
      amount: { amount: "500.00", currency: "CNY" },
      dueAt: due,
    }),
  );
  return service.confirm(
    {
      actionAuthorizationId: authorizationFor(a),
      intentId: a.id,
      intentHash: a.intentHash,
    },
    crypto.randomUUID(),
  );
}
it("two mock processors produce exactly one payment", async () => {
  const p = await create();
  const count = bankingStore.read().transactions.length;
  bankingStore.clock.reset(due);
  await Promise.all([
    new ScheduleService(bankingStore).processDue(),
    new ScheduleService(bankingStore).processDue(),
  ]);
  expect(Object.values(bankingStore.read().transfers)).toHaveLength(1);
  expect(bankingStore.read().transactions).toHaveLength(count + 1);
  expect(bankingStore.read().schedules[p.id].status).toBe("EXECUTED");
});
it("mock insufficient funds is final without partial debit", async () => {
  const p = await create();
  const next = bankingStore.read();
  const account = next.accounts.find((a) => a.id === "acc_current")!;
  account.balance.amount = "100.00";
  account.availableBalance.amount = "100.00";
  account.pendingAmount = { amount: "0.00", currency: "CNY" };
  bankingStore.commit(next);
  bankingStore.clock.reset(due);
  const service = new ScheduleService(bankingStore);
  await service.processDue();
  expect(bankingStore.read().schedules[p.id].failureReason).toBe(
    "INSUFFICIENT_FUNDS",
  );
  expect(Object.keys(bankingStore.read().transfers)).toHaveLength(0);
  expect(bankingStore.read().accounts).toEqual(next.accounts);
  await service.processDue();
  expect(Object.keys(bankingStore.read().transfers)).toHaveLength(0);
});
it("mock amendment invalidates competing cancel review", async () => {
  const p = await create();
  const service = new ScheduleService(bankingStore);
  const cancel = await verifiedIntent(
    service.prepare({
      actionType: "CANCEL",
      scheduleId: p.id,
      expectedVersion: 0,
    }),
  );
  const amendment = await verifiedIntent(
    service.prepare({
      actionType: "AMEND",
      scheduleId: p.id,
      expectedVersion: 0,
      sourceAccountId: p.sourceAccount.id,
      recipientId: "recipient_li",
      amount: { amount: "600.00", currency: "CNY" },
      dueAt: due,
    }),
  );
  service.confirm(
    {
      actionAuthorizationId: authorizationFor(amendment),
      intentId: amendment.id,
      intentHash: amendment.intentHash,
    },
    "amend",
  );
  expect(() =>
    service.confirm(
      {
        actionAuthorizationId: authorizationFor(cancel),
        intentId: cancel.id,
        intentHash: cancel.intentHash,
      },
      "cancel",
    ),
  ).toThrow("Schedule changed");
});
it("mock persistence failure leaves schedule and financial artifacts unchanged", async () => {
  const p = await create();
  const before = bankingStore.read();
  bankingStore.enablePersistence({
    getItem: () => null,
    setItem: () => {
      throw new Error("storage unavailable");
    },
  });
  bankingStore.clock.reset(due);
  try {
    await expect(
      new ScheduleService(bankingStore).processDue(),
    ).rejects.toThrow("storage unavailable");
    expect(bankingStore.read()).toEqual(before);
    expect(bankingStore.read().schedules[p.id].status).toBe("SCHEDULED");
  } finally {
    bankingStore.enablePersistence({ getItem: () => null, setItem: () => {} });
  }
});
