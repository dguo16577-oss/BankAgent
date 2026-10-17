import { consumeVerification } from "./security-service";
import type { components } from "@/generated/customer-api";
import { MockBankingStore } from "./store";
import { fail, hash, record } from "./service-support";
type S = components["schemas"];
export class RecipientService {
  constructor(private store: MockBankingStore) {}
  get(id: string) {
    return (
      this.store.read().recipients.find((r) => r.id === id) ??
      fail("RECIPIENT_NOT_FOUND", 404, "Recipient not found.")
    );
  }
  async prepare(body: unknown) {
    record(
      body,
      ["actionType", "destinationRef", "recipientId"],
      ["actionType"],
    );
    const next = this.store.read();
    const at = this.store.clock.now();
    let recipient: S["RecipientSummary"];
    if (body.actionType === "CREATE") {
      if (
        body.recipientId !== undefined ||
        !["demo-lin", "demo-lin-savings"].includes(String(body.destinationRef))
      )
        return fail(
          "INVALID_DESTINATION",
          422,
          "Choose a known demo destination.",
        );
      if (next.recipients.some((r) => r.destinationRef === body.destinationRef))
        return fail(
          "RECIPIENT_ALREADY_EXISTS",
          409,
          "This destination is already saved.",
        );
      recipient = {
        id: `recipient_${crypto.randomUUID()}`,
        displayName: "Lin Wei",
        bankName: "Aster Demo Bank",
        maskedAccountNumber:
          body.destinationRef === "demo-lin" ? "•••• 6201" : "•••• 6202",
        currency: "CNY",
        destinationRef: String(body.destinationRef),
        status: "ACTIVE",
        verificationStatus: "UNVERIFIED",
        createdAt: at,
        version: 0,
      };
    } else if (
      body.actionType === "DEACTIVATE" &&
      typeof body.recipientId === "string" &&
      body.destinationRef === undefined
    ) {
      recipient = this.get(body.recipientId);
      if (recipient.status === "INACTIVE")
        return fail("RECIPIENT_INACTIVE", 422, "Recipient is inactive.");
    } else return fail("INVALID_REQUEST", 400, "Invalid recipient action.");
    const terms = {
      id: `recipient_intent_${crypto.randomUUID()}`,
      actionType: body.actionType as S["RecipientActionType"],
      recipient,
      createdAt: at,
      expiresAt: new Date(Date.parse(at) + 900000).toISOString(),
      authorizationRequirement: "CONFIRMATION" as const,
    };
    const intent = {
      ...terms,
      intentHash: await hash({ ...terms, sessionId: next.currentSessionId }),
      status: "PREPARED" as const,
    };
    next.recipientIntents[intent.id] = {
      ...intent,
      sessionId: next.currentSessionId,
    };
    this.store.commit(next);
    return intent;
  }
  intent(id: string) {
    const state = this.store.read();
    const intent = state.recipientIntents[id];
    if (!intent || intent.sessionId !== state.currentSessionId)
      return fail(
        "RECIPIENT_INTENT_NOT_FOUND",
        404,
        "Recipient intent not found.",
      );
    const { sessionId: _, ...result } = intent;
    void _;
    if (
      !state.recipientResults[id] &&
      Date.parse(this.store.clock.now()) >= Date.parse(result.expiresAt)
    )
      result.status = "EXPIRED";
    return result;
  }
  execute(body: unknown, key: string | null, type: S["RecipientActionType"]) {
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
      return fail("INVALID_REQUEST", 400, "Invalid recipient execution.");
    const intent = this.intent(body.intentId);
    const next = this.store.read();
    const scoped = `${type}:${key}`;
    if (intent.actionType !== type)
      return fail("INVALID_REQUEST", 400, "Wrong action.");
    const old = next.recipientKeys[scoped];
    if (old) {
      if (
        old.intentId !== intent.id ||
        old.hash !== body.intentHash ||
        old.authorizationId !== body.actionAuthorizationId
      )
        return fail("IDEMPOTENCY_KEY_REUSED", 409, "Key already used.");
      return next.recipientResults[intent.id];
    }
    if (intent.intentHash !== body.intentHash)
      return fail("RECIPIENT_INTENT_HASH_MISMATCH", 409, "Review changed.");
    if (intent.status === "EXPIRED")
      return fail("RECIPIENT_INTENT_EXPIRED", 409, "Review expired.");
    if (next.recipientResults[intent.id])
      return fail(
        "RECIPIENT_INTENT_ALREADY_EXECUTED",
        409,
        "Already executed.",
      );
    consumeVerification(
      next,
      body.actionAuthorizationId,
      intent.id,
      intent.intentHash,
      this.store.clock.now(),
      "RECIPIENT_ACTION_INTENT",
      type === "CREATE" ? "RECIPIENT_CREATE" : "RECIPIENT_DEACTIVATE",
    );
    let result = intent.recipient;
    if (type === "CREATE") {
      if (
        next.recipients.some((r) => r.destinationRef === result.destinationRef)
      )
        return fail(
          "RECIPIENT_ALREADY_EXISTS",
          409,
          "This destination is already saved.",
        );
      next.recipients.push(result);
    } else {
      const index = next.recipients.findIndex((r) => r.id === result.id);
      if (
        index < 0 ||
        JSON.stringify(next.recipients[index]) !== JSON.stringify(result)
      )
        return fail("RECIPIENT_STATE_CHANGED", 409, "Recipient changed.");
      result = {
        ...result,
        status: "INACTIVE",
        version: (result.version ?? 0) + 1,
      };
      next.recipients[index] = result;
    }
    next.recipientResults[intent.id] = result;
    next.recipientIntents[intent.id].status = "EXECUTED";
    next.recipientKeys[scoped] = {
      intentId: intent.id,
      hash: body.intentHash,
      authorizationId:
        typeof body.actionAuthorizationId === "string"
          ? body.actionAuthorizationId
          : undefined,
    };
    this.store.commit(next);
    return result;
  }
}
