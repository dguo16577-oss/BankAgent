import type { components } from "@/generated/customer-api";
import type {
  CreateIntentRequest,
  ExecuteRequest,
  TransferIntent,
} from "@/lib/api/payments";
import { MockBankingStore, minor, decimal, type BankingState } from "./store";
import { fail, record, hash } from "./service-support";
import { consumeVerification } from "./security-service";
export { BankingError } from "./service-support";
function prepareBody(body: unknown): CreateIntentRequest {
  record(
    body,
    ["sourceAccountId", "recipientId", "amount", "note"],
    ["sourceAccountId", "recipientId", "amount"],
  );
  if (
    typeof body.sourceAccountId !== "string" ||
    typeof body.recipientId !== "string" ||
    (body.note !== undefined &&
      (typeof body.note !== "string" || body.note.length > 140))
  )
    fail("INVALID_REQUEST", 400, "Invalid identifiers or note.");
  record(body.amount, ["amount", "currency"], ["amount", "currency"]);
  if (
    typeof body.amount.amount !== "string" ||
    !/^(0|[1-9]\d{0,11})\.\d{2}$/.test(body.amount.amount) ||
    minor(body.amount.amount) <= BigInt(0)
  )
    fail(
      "INVALID_AMOUNT",
      422,
      "Enter a positive amount with two decimal places (up to 12 whole digits).",
    );
  if (body.amount.currency !== "CNY" && body.amount.currency !== "USD")
    fail("CURRENCY_MISMATCH", 422, "Unsupported currency.");
  return body as unknown as CreateIntentRequest;
}
function validate(state: BankingState, request: CreateIntentRequest) {
  const source = state.accounts.find(
    (account) => account.id === request.sourceAccountId,
  );
  if (!source)
    return fail("ACCOUNT_NOT_FOUND", 404, "Source account not found.");
  if (source.status !== "ACTIVE")
    fail("ACCOUNT_NOT_ELIGIBLE", 422, "Source account must be active.");
  const recipient = state.recipients.find(
    (item) => item.id === request.recipientId,
  );
  if (!recipient)
    return fail("RECIPIENT_NOT_FOUND", 404, "Recipient not found.");
  if (state.invalidRecipientIds.includes(recipient.id))
    fail("RECIPIENT_NOT_ELIGIBLE", 422, "Recipient is unavailable.");
  if (recipient.status === "INACTIVE")
    fail("RECIPIENT_INACTIVE", 422, "Recipient is inactive.");
  // This milestone is domestic CNY only; no FX or international execution.
  if (
    request.amount.currency !== "CNY" ||
    source.currency !== request.amount.currency ||
    recipient.currency !== request.amount.currency
  )
    fail(
      "CURRENCY_MISMATCH",
      422,
      "Domestic transfers require matching CNY accounts and recipients.",
    );
  if (minor(source.availableBalance.amount) < minor(request.amount.amount))
    fail("INSUFFICIENT_FUNDS", 422, "Insufficient available funds.");
  return { source, recipient };
}
export class TransferService {
  constructor(private store: MockBankingStore) {}
  recipients(search = "") {
    if (search.length > 100)
      fail("INVALID_QUERY", 400, "Search is limited to 100 characters.");
    const query = search.trim().toLowerCase();
    const compactPhone = query.replace(/[\s()\-]/g, "");
    const phone = /^1[3-9]\d{9}$/.test(compactPhone)
      ? `+86${compactPhone}`
      : /^00861[3-9]\d{9}$/.test(compactPhone)
        ? `+${compactPhone.slice(2)}`
        : /^\+861[3-9]\d{9}$/.test(compactPhone)
          ? compactPhone
          : null;
    return {
      items: this.store
        .read()
        .recipients.filter((item) =>
          phone
            ? item.id === "recipient_zhang" && phone === "+8613800138000"
            : [item.displayName, item.bankName].some((value) =>
                value.toLowerCase().includes(query),
              ),
        ),
    };
  }
  async prepare(body: unknown) {
    const request = structuredClone(prepareBody(body));
    const { source, recipient } = validate(this.store.read(), request);
    const createdAt = this.store.clock.now();
    const terms = {
      id: `intent_${crypto.randomUUID()}`,
      sourceAccount: source,
      recipient,
      amount: request.amount,
      fee: { amount: "0.00", currency: request.amount.currency },
      totalDebit: request.amount,
      projectedAvailableBalance: {
        amount: decimal(
          minor(source.availableBalance.amount) - minor(request.amount.amount),
        ),
        currency: source.currency,
      },
      note: request.note?.trim() ?? "",
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + 15 * 60 * 1000).toISOString(),
      authorizationRequirement: "CONFIRMATION" as const,
      policyVersion: "PAYMENT_CONFIRMATION_V1",
    };
    const sessionId = this.store.read().currentSessionId;
    const intent: TransferIntent = {
      ...terms,
      status: "PREPARED",
      intentHash: await hash({
        ...terms,
        sessionId,
      }),
    };
    // Read fresh after hashing so concurrent preparations cannot overwrite each other.
    const next = this.store.read();
    if (next.currentSessionId !== sessionId)
      fail(
        "TRANSFER_SESSION_MISMATCH",
        403,
        "Prepare the transfer in this session.",
      );
    next.intents[intent.id] = intent;
    next.transferSessions[intent.id] = next.currentSessionId;
    this.commit(next);
    return structuredClone(intent);
  }
  intent(id: string) {
    const intents = this.store.read().intents;
    const intent = Object.hasOwn(intents, id) ? intents[id] : undefined;
    if (!intent)
      return fail(
        "TRANSFER_INTENT_NOT_FOUND",
        404,
        "Transfer intent not found.",
      );
    if (
      intent.status === "PREPARED" &&
      Date.parse(this.store.clock.now()) >= Date.parse(intent.expiresAt)
    )
      intent.status = "EXPIRED";
    return intent;
  }
  receipt(id: string) {
    const transfers = this.store.read().transfers;
    return (
      (Object.hasOwn(transfers, id) ? transfers[id] : undefined) ??
      fail("TRANSFER_NOT_FOUND", 404, "Transfer not found.")
    );
  }
  execute(body: unknown, key: string | null) {
    record(
      body,
      ["intentId", "intentHash", "actionAuthorizationId"],
      ["intentId", "intentHash"],
    );
    if (
      body.actionAuthorizationId !== undefined &&
      (typeof body.actionAuthorizationId !== "string" ||
        !body.actionAuthorizationId)
    )
      fail("INVALID_REQUEST", 400, "Invalid authorization.");
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
    const request = body as ExecuteRequest;
    const next = this.store.read();
    if (
      Object.hasOwn(next.transferSessions, request.intentId) &&
      next.transferSessions[request.intentId] !== next.currentSessionId
    )
      fail(
        "TRANSFER_SESSION_MISMATCH",
        403,
        "Prepare the transfer in this session.",
      );
    const previous = Object.hasOwn(next.idempotency, key)
      ? next.idempotency[key]
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
          "This idempotency key was used for a different request.",
        );
      return structuredClone(next.transfers[previous.transferId]);
    }
    const intent = Object.hasOwn(next.intents, request.intentId)
      ? next.intents[request.intentId]
      : undefined;
    if (!intent)
      return fail(
        "TRANSFER_INTENT_NOT_FOUND",
        404,
        "Transfer intent not found.",
      );
    if (intent.intentHash !== request.intentHash)
      fail(
        "TRANSFER_INTENT_HASH_MISMATCH",
        409,
        "The reviewed intent does not match. Prepare a new transfer.",
      );
    if (intent.status === "EXECUTED")
      fail(
        "TRANSFER_INTENT_ALREADY_EXECUTED",
        409,
        "This intent has already been executed.",
      );
    if (Date.parse(this.store.clock.now()) >= Date.parse(intent.expiresAt))
      fail(
        "TRANSFER_INTENT_EXPIRED",
        409,
        "This intent has expired. Prepare a new transfer.",
      );
    const receipt = settleTransfer(next, intent, this.store.clock.now());
    const { id, completedAt } = receipt;
    consumeVerification(
      next,
      request.actionAuthorizationId,
      intent.id,
      intent.intentHash,
      this.store.clock.now(),
      "TRANSFER_INTENT",
      "TRANSFER_EXECUTE",
    );
    next.transfers[id] = receipt;
    Object.defineProperty(next.idempotency, key, {
      value: { request, transferId: id },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    next.asOf = completedAt;
    next.clockAt = completedAt;
    next.revision++;
    // No await between validation and single commit: concurrent handlers serialize here.
    this.commit(next);
    this.store.clock.reset(completedAt);
    return structuredClone(receipt);
  }
  private commit(next: BankingState) {
    try {
      this.store.commit(next);
    } catch {
      fail(
        "PERSISTENCE_UNAVAILABLE",
        500,
        "Demo state could not be saved. No transfer was committed; retry safely.",
      );
    }
  }
}

export function settleTransfer(
  next: BankingState,
  intent: TransferIntent,
  now: string,
) {
  const { source, recipient } = validate(
    next,
    prepareBody({
      sourceAccountId: intent.sourceAccount.id,
      recipientId: intent.recipient.id,
      amount: intent.amount,
      note: intent.note,
    }),
  );
  if (
    JSON.stringify(recipient) !== JSON.stringify(intent.recipient) ||
    source.maskedAccountNumber !== intent.sourceAccount.maskedAccountNumber
  )
    fail(
      "TRANSFER_INTENT_HASH_MISMATCH",
      409,
      "Reviewed account or recipient changed. Prepare a new transfer.",
    );
  if (minor(source.availableBalance.amount) < minor(intent.totalDebit.amount))
    fail("INSUFFICIENT_FUNDS", 422, "Insufficient available funds.");
  const completedAt = new Date(Date.parse(now) + 1000).toISOString();
  const id = `transfer_${++next.sequence}`;
  const transactionId = `txn_${id}`;
  const reference = `ASTER-${id.toUpperCase()}`;
  const receipt: components["schemas"]["TransferReceipt"] = {
    id,
    status: "COMPLETED",
    intentId: intent.id,
    sourceAccount: structuredClone(source),
    recipient: structuredClone(recipient),
    amount: intent.amount,
    fee: intent.fee,
    totalDebit: intent.totalDebit,
    note: intent.note,
    reference,
    transactionId,
    createdAt: completedAt,
    completedAt,
  };
  source.balance.amount = decimal(
    minor(source.balance.amount) - minor(intent.totalDebit.amount),
  );
  source.availableBalance.amount = decimal(
    minor(source.availableBalance.amount) - minor(intent.totalDebit.amount),
  );
  next.transactions.push({
    id: transactionId,
    accountId: source.id,
    title: `To ${recipient.displayName}`,
    amount: intent.amount,
    direction: "DEBIT",
    status: "COMPLETED",
    type: "BANK_TRANSFER",
    category: "TRANSFER",
    counterparty: {
      name: recipient.displayName,
      maskedAccountNumber: recipient.maskedAccountNumber,
    },
    occurredAt: completedAt,
    bookedAt: completedAt,
    reference,
  });
  intent.status = "EXECUTED";

  next.transfers[id] = receipt;
  return receipt;
}
