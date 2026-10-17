import type { components } from "@/generated/customer-api";
import { MockBankingStore, type BankingState } from "./store";
import { TransferService, settleTransfer } from "./transfer-service";
import { BankingError, fail, hash, record } from "./service-support";
import { consumeVerification } from "./security-service";
type S = components["schemas"];
function mutable(p: S["ScheduledPayment"], version: unknown, at: string) {
  if (p.status !== "SCHEDULED" || p.version !== version)
    fail("SCHEDULE_STATE_CHANGED", 409, "Schedule changed. Review again.");
  if (Date.parse(at) >= Date.parse(p.dueAt))
    fail("SCHEDULE_ALREADY_DUE", 409, "This instruction is already due.");
}
function mandate(p: S["ScheduledPayment"]) {
  return hash({
    id: p.id,
    source: p.sourceAccount.id,
    recipient: p.recipient,
    amount: p.amount,
    fee: p.fee,
    total: p.totalDebit,
    due: p.dueAt,
    version: p.version,
    note: p.note,
    policy: "PAYMENT_CONFIRMATION_V1",
  });
}
export class ScheduleService {
  constructor(private store: MockBankingStore) {}
  list() {
    return {
      items: Object.values(this.store.read().schedules).sort(
        (a, b) =>
          Number(b.status === "SCHEDULED") - Number(a.status === "SCHEDULED") ||
          Date.parse(a.dueAt) - Date.parse(b.dueAt) ||
          a.id.localeCompare(b.id),
      ),
    };
  }
  get(id: string) {
    return (
      this.store.read().schedules[id] ??
      fail("SCHEDULE_NOT_FOUND", 404, "Scheduled payment not found.")
    );
  }
  async prepare(body: unknown) {
    record(
      body,
      [
        "actionType",
        "scheduleId",
        "expectedVersion",
        "sourceAccountId",
        "recipientId",
        "amount",
        "dueAt",
        "note",
      ],
      ["actionType"],
    );
    const sessionId = this.store.read().currentSessionId;
    if (!sessionId) return fail("UNAUTHENTICATED", 401, "Login required.");
    const at = this.store.clock.now();
    const type = body.actionType;
    if (type !== "CREATE" && type !== "AMEND" && type !== "CANCEL")
      return fail("INVALID_REQUEST", 400, "Unknown action.");
    const old =
      type === "CREATE" ? undefined : this.get(String(body.scheduleId));
    if (old) mutable(old, body.expectedVersion, at);
    let p: S["ScheduledPayment"];
    if (type === "CANCEL") {
      record(
        body,
        ["actionType", "scheduleId", "expectedVersion"],
        ["actionType", "scheduleId", "expectedVersion"],
      );
      p = old!;
    } else {
      if (
        type === "CREATE" &&
        (body.scheduleId !== undefined || body.expectedVersion !== undefined)
      )
        fail("INVALID_REQUEST", 400, "Unexpected resource.");
      if (
        typeof body.dueAt !== "string" ||
        !/(Z|[+-]\d{2}:\d{2})$/.test(body.dueAt) ||
        !Number.isFinite(Date.parse(body.dueAt)) ||
        Date.parse(body.dueAt) <= Date.parse(at)
      )
        return fail(
          "INVALID_SCHEDULE_TIME",
          422,
          "Choose a future offset-aware time.",
        );
      if (old && old.sourceAccount.id !== body.sourceAccountId)
        fail("INVALID_REQUEST", 400, "Source account cannot change.");
      const t = await new TransferService(this.store).prepare({
        sourceAccountId: body.sourceAccountId,
        recipientId: body.recipientId,
        amount: body.amount,
        ...(body.note === undefined ? {} : { note: body.note }),
      });
      p = {
        id: old?.id ?? `schedule_${crypto.randomUUID()}`,
        sourceAccount: t.sourceAccount,
        recipient: t.recipient,
        amount: t.amount,
        fee: t.fee,
        totalDebit: t.totalDebit,
        dueAt: body.dueAt,
        status: "SCHEDULED",
        version: old ? old.version + 1 : 0,
        createdAt: old?.createdAt ?? at,
        updatedAt: at,
        note: t.note ?? "",
      };
    }
    const id = `schedule_action_${crypto.randomUUID()}`;
    const mandateHash = await mandate(p);
    const intentHash = await hash({
      id,
      sessionId,
      type,
      p,
      version: old?.version ?? -1,
      mandateHash,
    });
    const next = this.store.read();
    if (next.currentSessionId !== sessionId)
      fail("TRANSFER_SESSION_MISMATCH", 403, "Session changed.");
    const intent: BankingState["scheduleIntents"][string] = {
      id,
      actionType: type,
      schedule: p,
      intentHash,
      createdAt: at,
      expiresAt: new Date(Date.parse(at) + 900000).toISOString(),
      status: "PREPARED",
      authorizationRequirement: "CONFIRMATION",
      policyVersion: "PAYMENT_CONFIRMATION_V1",
      sessionId,
      expectedVersion: old?.version ?? -1,
      mandateHash,
    };
    next.scheduleIntents[id] = intent;
    this.store.commit(next);
    return this.intent(id);
  }
  intent(id: string) {
    const next = this.store.read();
    const a =
      next.scheduleIntents[id] ??
      fail("SCHEDULE_INTENT_NOT_FOUND", 404, "Intent not found.");
    if (a.sessionId !== next.currentSessionId)
      fail("TRANSFER_SESSION_MISMATCH", 403, "Session mismatch.");
    return {
      id: a.id,
      actionType: a.actionType,
      schedule: a.schedule,
      intentHash: a.intentHash,
      createdAt: a.createdAt,
      expiresAt: a.expiresAt,
      authorizationRequirement: a.authorizationRequirement,
      policyVersion: a.policyVersion,
      status: next.scheduleResults[id]
        ? "EXECUTED"
        : Date.parse(this.store.clock.now()) >= Date.parse(a.expiresAt)
          ? "EXPIRED"
          : "PREPARED",
    } satisfies S["ScheduleActionIntent"];
  }
  confirm(body: unknown, key: string | null) {
    record(
      body,
      ["intentId", "intentHash", "actionAuthorizationId"],
      ["intentId", "intentHash"],
    );
    if (
      !key ||
      !/^[-\w]{1,128}$/.test(key) ||
      typeof body.intentId !== "string" ||
      typeof body.intentHash !== "string"
    )
      return fail("INVALID_REQUEST", 400, "Invalid confirmation.");
    const visible = this.intent(body.intentId);
    const next = this.store.read();
    const a = next.scheduleIntents[visible.id];
    const fingerprint = JSON.stringify([
      body.intentId,
      body.intentHash,
      body.actionAuthorizationId ?? null,
      next.currentSessionId,
    ]);
    const prior = next.scheduleKeys[key];
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        fail("IDEMPOTENCY_KEY_REUSED", 409, "Key already used.");
      return next.scheduleResults[prior.intentId];
    }
    if (a.intentHash !== body.intentHash)
      fail("SCHEDULE_INTENT_HASH_MISMATCH", 409, "Terms do not match.");
    if (visible.status !== "PREPARED")
      fail("SCHEDULE_INTENT_UNAVAILABLE", 409, "Prepare again.");
    const at = this.store.clock.now();
    let p = structuredClone(a.schedule);
    if (a.actionType !== "CREATE")
      mutable(this.get(p.id), a.expectedVersion, at);
    if (a.actionType === "CANCEL")
      p = { ...p, status: "CANCELLED", version: p.version + 1, updatedAt: at };
    else {
      if (Date.parse(p.dueAt) <= Date.parse(at))
        fail("INVALID_SCHEDULE_TIME", 422, "Choose a future time.");
      // Validate with the same Transfer primitive without committing its candidate debit.
      const trial = structuredClone(next);
      settleTransfer(trial, this.transferIntent(p, at), at);
    }
    consumeVerification(
      next,
      body.actionAuthorizationId,
      a.id,
      a.intentHash,
      at,
      "SCHEDULE_ACTION_INTENT",
      a.actionType === "CREATE"
        ? "SCHEDULED_PAYMENT_CREATE"
        : a.actionType === "AMEND"
          ? "SCHEDULED_PAYMENT_MODIFY"
          : "SCHEDULED_PAYMENT_CANCEL",
    );
    next.schedules[p.id] = p;
    next.scheduleMandates[p.id] = a.mandateHash;
    next.scheduleResults[a.id] = p;
    next.scheduleKeys[key] = { fingerprint, intentId: a.id };
    this.store.commit(next);
    return p;
  }
  private transferIntent(
    p: S["ScheduledPayment"],
    at: string,
  ): S["TransferIntent"] {
    return {
      id: `due_${p.id}`,
      sourceAccount: p.sourceAccount,
      recipient: p.recipient,
      amount: { amount: p.amount.amount, currency: "CNY" },
      fee: p.fee,
      totalDebit: p.totalDebit,
      projectedAvailableBalance: p.sourceAccount.availableBalance,
      createdAt: at,
      expiresAt: at,
      intentHash: "internal-mandate",
      status: "PREPARED",
      note: p.note,
      authorizationRequirement: "CONFIRMATION",
      policyVersion: "PAYMENT_CONFIRMATION_V1",
    };
  }
  async processDue() {
    for (const candidate of this.list().items) {
      if (
        candidate.status !== "SCHEDULED" ||
        Date.parse(candidate.dueAt) > Date.parse(this.store.clock.now())
      )
        continue;
      const integrity = await mandate(candidate);
      const next = this.store.read();
      const p = next.schedules[candidate.id];
      if (p.status !== "SCHEDULED" || p.version !== candidate.version) continue;
      const at = this.store.clock.now();
      try {
        if (integrity !== next.scheduleMandates[p.id])
          fail("SCHEDULE_TERMS_INVALID", 422, "Terms invalid.");
        const receipt = settleTransfer(next, this.transferIntent(p, at), at);
        next.schedules[p.id] = {
          ...p,
          status: "EXECUTED",
          version: p.version + 1,
          updatedAt: at,
          executedAt: at,
          transferId: receipt.id,
          transactionId: receipt.transactionId,
        };
        next.revision++;
        next.asOf = at;
      } catch (e) {
        if (!(e instanceof BankingError)) throw e;
        next.schedules[p.id] = {
          ...p,
          status: "FAILED",
          version: p.version + 1,
          updatedAt: at,
          failureReason: e.code,
        };
      }
      this.store.commit(next);
    }
  }
}
