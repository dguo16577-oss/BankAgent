import { consumeVerification } from "./security-service";
import type { components } from "@/generated/customer-api";
import { MockBankingStore, type BankingState } from "./store";
import { fail, hash, record } from "./service-support";
import { summarizeRecurring } from "../data/recurring-fixtures";
type S = components["schemas"];
function stateOf(
  item: S["RecurringPaymentDetail"],
): S["RecurringPaymentState"] {
  return {
    status: item.status,
    nextExpectedAt: item.nextExpectedAt,
    managementCapability: item.managementCapability,
    version: item.version,
  };
}
function manageable(item: S["RecurringPaymentDetail"]) {
  if (item.status === "STOPPED")
    fail(
      "RECURRING_PAYMENT_ALREADY_STOPPED",
      409,
      "Future payments have already been stopped.",
    );
  if (
    item.status !== "ACTIVE" ||
    item.source !== "BANK_MANAGED" ||
    item.managementCapability !== "STOP_FUTURE_PAYMENTS" ||
    item.type === "DETECTED_RECURRING_PAYMENT"
  )
    fail(
      "RECURRING_PAYMENT_NOT_MANAGEABLE",
      422,
      "This recurring payment cannot be managed through Aster Bank.",
    );
}
export class RecurringService {
  constructor(private store: MockBankingStore) {}
  list(): S["RecurringPaymentsResponse"] {
    return {
      items: this.store.read().recurringPayments.map(summarizeRecurring),
    };
  }
  detail(id: string) {
    return (
      this.store.read().recurringPayments.find((p) => p.id === id) ??
      fail("RECURRING_PAYMENT_NOT_FOUND", 404, "Recurring payment not found.")
    );
  }
  async prepare(body: unknown): Promise<S["RecurringPaymentActionIntent"]> {
    record(
      body,
      ["recurringPaymentId", "actionType"],
      ["recurringPaymentId", "actionType"],
    );
    if (
      typeof body.recurringPaymentId !== "string" ||
      !body.recurringPaymentId ||
      body.actionType !== "STOP_FUTURE_PAYMENTS"
    )
      fail(
        "INVALID_REQUEST",
        400,
        "Choose a recurring payment and STOP_FUTURE_PAYMENTS.",
      );
    const payment = this.detail(body.recurringPaymentId);
    manageable(payment);
    const before = stateOf(payment);
    const after: S["RecurringPaymentState"] = {
      ...before,
      status: "STOPPED",
      nextExpectedAt: null,
      version: before.version + 1,
    };
    const effectDescription =
      payment.type === "CARD_SUBSCRIPTION"
        ? "Block future recurring merchant payments through Aster Bank."
        : payment.type === "DIRECT_DEBIT"
          ? "Revoke the bank-side direct debit mandate."
          : "Cancel future scheduled bank payments.";
    const createdAt = this.store.clock.now();
    const terms = {
      id: `recurring_intent_${crypto.randomUUID()}`,
      actionType: "STOP_FUTURE_PAYMENTS" as const,
      recurringPayment: payment,
      before,
      after,
      effectDescription,
      authorizationRequirement: "CONFIRMATION" as const,
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + 900000).toISOString(),
    };
    const intent: S["RecurringPaymentActionIntent"] = {
      ...terms,
      intentHash: await hash(terms),
      status: "PREPARED",
    };
    const next = this.store.read();
    next.recurringPaymentActionIntents[intent.id] = intent;
    this.commit(next);
    return structuredClone(intent);
  }
  intent(id: string) {
    const map = this.store.read().recurringPaymentActionIntents;
    const intent = Object.hasOwn(map, id) ? map[id] : undefined;
    if (!intent)
      return fail(
        "RECURRING_PAYMENT_INTENT_NOT_FOUND",
        404,
        "Recurring payment intent not found.",
      );
    if (
      intent.status === "PREPARED" &&
      Date.parse(this.store.clock.now()) >= Date.parse(intent.expiresAt)
    )
      intent.status = "EXPIRED";
    return intent;
  }
  receipt(id: string) {
    const map = this.store.read().recurringPaymentActions;
    return (
      (Object.hasOwn(map, id) ? map[id] : undefined) ??
      fail(
        "RECURRING_PAYMENT_ACTION_NOT_FOUND",
        404,
        "Recurring payment action not found.",
      )
    );
  }
  execute(
    body: unknown,
    key: string | null,
  ): S["RecurringPaymentActionReceipt"] {
    record(
      body,
      ["intentId", "intentHash", "actionAuthorizationId"],
      ["intentId", "intentHash"],
    );
    if (
      typeof body.intentId !== "string" ||
      typeof body.intentHash !== "string" ||
      !key ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(key)
    )
      fail(
        "INVALID_REQUEST",
        400,
        "A valid Idempotency-Key and intent reference are required.",
      );
    const request = body as S["ExecuteRecurringPaymentActionRequest"];
    const next = this.store.read();
    const previous = Object.hasOwn(next.recurringIdempotency, key)
      ? next.recurringIdempotency[key]
      : undefined;
    if (previous) {
      if (
        previous.request.intentId !== request.intentId ||
        previous.request.intentHash !== request.intentHash ||
        previous.request.actionAuthorizationId !== request.actionAuthorizationId
      )
        fail(
          "IDEMPOTENCY_KEY_REUSED",
          409,
          "This key was used for a different recurring payment action request.",
        );
      return structuredClone(next.recurringPaymentActions[previous.actionId]);
    }
    const intent = Object.hasOwn(
      next.recurringPaymentActionIntents,
      request.intentId,
    )
      ? next.recurringPaymentActionIntents[request.intentId]
      : undefined;
    if (!intent)
      return fail(
        "RECURRING_PAYMENT_INTENT_NOT_FOUND",
        404,
        "Recurring payment intent not found.",
      );
    if (intent.intentHash !== request.intentHash)
      fail(
        "RECURRING_PAYMENT_INTENT_HASH_MISMATCH",
        409,
        "The reviewed intent does not match. Prepare a new action.",
      );
    if (intent.status === "EXECUTED")
      fail(
        "RECURRING_PAYMENT_INTENT_ALREADY_EXECUTED",
        409,
        "This intent has already been executed.",
      );
    if (Date.parse(this.store.clock.now()) >= Date.parse(intent.expiresAt))
      fail(
        "RECURRING_PAYMENT_INTENT_EXPIRED",
        409,
        "This intent has expired. Return to the payment to prepare a new action.",
      );
    const payment = next.recurringPayments.find(
      (p) => p.id === intent.recurringPayment.id,
    );
    if (!payment)
      return fail(
        "RECURRING_PAYMENT_NOT_FOUND",
        404,
        "Recurring payment not found.",
      );
    // Compare the complete reviewed terms as well as the version. This catches
    // changed amounts, schedules, links or capability before any mutation.
    if (
      JSON.stringify(stateOf(payment)) !== JSON.stringify(intent.before) ||
      JSON.stringify(payment) !== JSON.stringify(intent.recurringPayment)
    )
      fail(
        "RECURRING_PAYMENT_STATE_CHANGED",
        409,
        "Recurring payment state changed. Return to the payment and review a new action.",
      );
    manageable(payment);
    consumeVerification(
      next,
      request.actionAuthorizationId,
      request.intentId,
      request.intentHash,
      this.store.clock.now(),
      "RECURRING_PAYMENT_INTENT",
      "RECURRING_STOP_FUTURE_PAYMENTS",
    );
    const effectiveAt = new Date(
      Date.parse(this.store.clock.now()) + 1000,
    ).toISOString();
    Object.assign(payment, intent.after);
    const id = `recurring_action_${++next.recurringSequence}`;
    const receipt: S["RecurringPaymentActionReceipt"] = {
      id,
      intentId: intent.id,
      actionType: intent.actionType,
      status: "COMPLETED",
      recurringPayment: summarizeRecurring(payment),
      before: intent.before,
      after: intent.after,
      effectDescription: intent.effectDescription,
      authorizationRequirement: "CONFIRMATION",
      effectiveAt,
      reference: `ASTER-RECURRING-${next.recurringSequence}`,
    };
    next.recurringPaymentActions[id] = receipt;
    intent.status = "EXECUTED";
    Object.defineProperty(next.recurringIdempotency, key, {
      value: { request, actionId: id },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    next.clockAt = effectiveAt;
    this.commit(next);
    this.store.clock.reset(effectiveAt);
    return structuredClone(receipt);
  }
  private commit(next: BankingState) {
    try {
      this.store.commit(next);
    } catch {
      fail(
        "PERSISTENCE_UNAVAILABLE",
        500,
        "Demo state could not be saved. No recurring payment change was committed; retry safely.",
      );
    }
  }
}
