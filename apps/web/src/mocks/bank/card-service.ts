import {
  SecurityService,
  validateActionAuthorization,
  consumeVerification,
} from "./security-service";
import type { components } from "@/generated/customer-api";
import type {
  CardDetail,
  CardControls,
  CreateCardActionRequest,
  CardActionIntent,
  CardActionReceipt,
  ExecuteCardActionRequest,
} from "@/lib/api/cards";
import { MockBankingStore, type BankingState } from "./store";
import { fail, hash, record } from "./service-support";
import { summarizeCard } from "../data/card-fixtures";
type Schema = components["schemas"];
const controlKeys = [
  "onlinePayments",
  "internationalPayments",
  "atmWithdrawals",
  "contactless",
] as const;
function stateOf(card: CardDetail): Schema["CardState"] {
  return structuredClone({
    status: card.status,
    controls: card.controls,
    version: card.version,
  });
}
function sameState(a: Schema["CardState"], b: Schema["CardState"]) {
  return (
    a.status === b.status &&
    a.version === b.version &&
    controlKeys.every((key) => a.controls[key] === b.controls[key])
  );
}
export function classifyCardChange(
  before: Schema["CardState"],
  after: Schema["CardState"],
): Pick<CardActionIntent, "riskDirection" | "authorizationRequirement"> {
  const increasing =
    (before.status === "FROZEN" && after.status === "ACTIVE") ||
    controlKeys.some((key) => !before.controls[key] && after.controls[key]);
  const protective =
    (before.status === "ACTIVE" && after.status === "FROZEN") ||
    controlKeys.some((key) => before.controls[key] && !after.controls[key]);
  return increasing
    ? {
        riskDirection: "RISK_INCREASING",
        authorizationRequirement: "STEP_UP_AUTH",
      }
    : {
        riskDirection: protective ? "PROTECTIVE" : "NEUTRAL",
        authorizationRequirement: "CONFIRMATION",
      };
}
function parsePrepare(body: unknown): CreateCardActionRequest {
  record(body, ["cardId", "actionType", "controls"], ["cardId", "actionType"]);
  if (typeof body.cardId !== "string" || !body.cardId)
    fail("INVALID_REQUEST", 400, "Choose a card.");
  if (body.actionType === "UPDATE_CONTROLS") {
    record(body.controls, [...controlKeys], [...controlKeys]);
    if (
      controlKeys.some(
        (key) =>
          typeof body.controls !== "object" ||
          body.controls === null ||
          typeof Reflect.get(body.controls, key) !== "boolean",
      )
    )
      fail("INVALID_REQUEST", 400, "All card controls must be boolean values.");
    const controls = body.controls as CardControls;
    return {
      cardId: body.cardId,
      actionType: "UPDATE_CONTROLS",
      controls: {
        onlinePayments: controls.onlinePayments,
        internationalPayments: controls.internationalPayments,
        atmWithdrawals: controls.atmWithdrawals,
        contactless: controls.contactless,
      },
    };
  }
  if (
    (body.actionType !== "FREEZE" && body.actionType !== "UNFREEZE") ||
    Object.hasOwn(body, "controls")
  )
    fail(
      "INVALID_REQUEST",
      400,
      "Use a supported action with its required fields only.",
    );
  return { cardId: body.cardId, actionType: body.actionType };
}
export class CardService {
  constructor(private store: MockBankingStore) {}
  list(): Schema["CardsResponse"] {
    return { items: this.store.read().cards.map(summarizeCard) };
  }
  card(id: string) {
    return (
      this.store.read().cards.find((card) => card.id === id) ??
      fail("CARD_NOT_FOUND", 404, "Card not found.")
    );
  }
  async prepare(body: unknown) {
    const request = parsePrepare(body);
    const card = this.card(request.cardId);
    if (card.status !== "ACTIVE" && card.status !== "FROZEN")
      fail(
        "CARD_NOT_ELIGIBLE",
        422,
        "Expired or cancelled cards cannot be changed.",
      );
    if (
      (request.actionType === "FREEZE" && card.status !== "ACTIVE") ||
      (request.actionType === "UNFREEZE" && card.status !== "FROZEN")
    )
      fail(
        "CARD_NOT_ELIGIBLE",
        422,
        "This action is not available for the current card status.",
      );
    const before = stateOf(card);
    const after = structuredClone(before);
    after.version++;
    if (request.actionType === "FREEZE") after.status = "FROZEN";
    else if (request.actionType === "UNFREEZE") after.status = "ACTIVE";
    else if (request.actionType === "UPDATE_CONTROLS")
      after.controls = request.controls;
    const risk = classifyCardChange(before, after);
    if (risk.riskDirection === "NEUTRAL")
      fail("NO_CARD_CHANGES", 422, "Choose at least one changed control.");
    const createdAt = this.store.clock.now();
    const terms = {
      id: `card_intent_${crypto.randomUUID()}`,
      actionType: request.actionType,
      card: summarizeCard(card),
      before,
      after,
      ...risk,
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + 15 * 60 * 1000).toISOString(),
    };
    const intent: CardActionIntent = {
      ...terms,
      status: "PREPARED",
      intentHash: await hash(terms),
    };
    const next = this.store.read();
    next.cardIntents[intent.id] = intent;
    this.commit(next);
    return structuredClone(intent);
  }
  intent(id: string) {
    const intents = this.store.read().cardIntents;
    const intent = Object.hasOwn(intents, id) ? intents[id] : undefined;
    if (!intent)
      return fail(
        "CARD_ACTION_INTENT_NOT_FOUND",
        404,
        "Card action intent not found.",
      );
    if (
      intent.status === "PREPARED" &&
      Date.parse(this.store.clock.now()) >= Date.parse(intent.expiresAt)
    )
      intent.status = "EXPIRED";
    return intent;
  }
  receipt(id: string) {
    const actions = this.store.read().cardActions;
    return (
      (Object.hasOwn(actions, id) ? actions[id] : undefined) ??
      fail("CARD_ACTION_NOT_FOUND", 404, "Card action not found.")
    );
  }
  execute(body: unknown, key: string | null) {
    new SecurityService(this.store).session();
    record(
      body,
      ["intentId", "intentHash", "actionAuthorizationId"],
      ["intentId", "intentHash"],
    );
    if (
      body.actionAuthorizationId !== undefined &&
      typeof body.actionAuthorizationId !== "string"
    )
      fail("INVALID_REQUEST", 400, "Authorization ID must be a string.");
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
    const request = body as ExecuteCardActionRequest;
    const next = this.store.read();
    const previous = Object.hasOwn(next.cardIdempotency, key)
      ? next.cardIdempotency[key]
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
          "This key was used for a different card action request.",
        );
      return structuredClone(next.cardActions[previous.actionId]);
    }
    const intent = Object.hasOwn(next.cardIntents, request.intentId)
      ? next.cardIntents[request.intentId]
      : undefined;
    if (!intent)
      return fail(
        "CARD_ACTION_INTENT_NOT_FOUND",
        404,
        "Card action intent not found.",
      );
    if (request.actionAuthorizationId) {
      validateActionAuthorization(
        next,
        request.actionAuthorizationId,
        request.intentId,
        request.intentHash,
        this.store.clock.now(),
      );
    }
    if (intent.intentHash !== request.intentHash)
      fail(
        "CARD_ACTION_INTENT_HASH_MISMATCH",
        409,
        "The reviewed intent does not match. Prepare a new action.",
      );
    if (intent.status === "EXECUTED")
      fail(
        "CARD_ACTION_INTENT_ALREADY_EXECUTED",
        409,
        "This card action has already been executed.",
      );
    if (Date.parse(this.store.clock.now()) >= Date.parse(intent.expiresAt))
      fail(
        "CARD_ACTION_INTENT_EXPIRED",
        409,
        "This intent has expired. Prepare a new action.",
      );
    const card = next.cards.find((item) => item.id === intent.card.id);
    if (!card) return fail("CARD_NOT_FOUND", 404, "Card not found.");
    if (!sameState(stateOf(card), intent.before))
      fail(
        "CARD_STATE_CHANGED",
        409,
        "Card state changed after preparation. Review a new action.",
      );
    const risk = classifyCardChange(intent.before, intent.after);
    if (
      risk.authorizationRequirement === "STEP_UP_AUTH" ||
      intent.authorizationRequirement === "STEP_UP_AUTH"
    ) {
      validateActionAuthorization(
        next,
        request.actionAuthorizationId,
        intent.id,
        intent.intentHash,
        this.store.clock.now(),
      );
    }
    const completedAt = new Date(
      Date.parse(this.store.clock.now()) + 1000,
    ).toISOString();
    Object.assign(card, {
      status: intent.after.status,
      controls: structuredClone(intent.after.controls),
      version: intent.after.version,
      updatedAt: completedAt,
    });
    const id = `card_action_${++next.cardSequence}`;
    const receipt: CardActionReceipt = {
      id,
      intentId: intent.id,
      status: "COMPLETED",
      actionType: intent.actionType,
      card: summarizeCard(card),
      before: intent.before,
      after: intent.after,
      ...risk,
      reference: `ASTER-CARD-${next.cardSequence}`,
      createdAt: completedAt,
      completedAt,
    };
    if (intent.actionType !== "FREEZE")
      consumeVerification(
        next,
        request.actionAuthorizationId,
        intent.id,
        intent.intentHash,
        completedAt,
        "CARD_ACTION_INTENT",
        intent.actionType === "UNFREEZE"
          ? "CARD_UNFREEZE"
          : risk.riskDirection === "RISK_INCREASING"
            ? "CARD_CONTROL_RISK_INCREASING"
            : "CARD_CONTROL_PROTECTIVE",
      );
    next.cardActions[id] = receipt;
    intent.status = "EXECUTED";
    Object.defineProperty(next.cardIdempotency, key, {
      value: { request, actionId: id },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    next.clockAt = completedAt;
    // Financial asOf, accounts, transactions, spending and wealth stay untouched.
    // No await between validation and this atomic replacement.
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
        "Demo state could not be saved. No card change was committed; retry safely.",
      );
    }
  }
}
