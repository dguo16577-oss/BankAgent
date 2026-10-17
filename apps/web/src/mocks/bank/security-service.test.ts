import { beforeEach, expect, it } from "vitest";
import { bankingStore, MockBankingStore } from "./store";
import { SecurityService } from "./security-service";
import { CardService } from "./card-service";
import {
  securityFixture,
  temporaryTestCredential,
} from "../data/security-fixture";
import { apiGet, apiPost } from "@/lib/api/client";
import type { components } from "@/generated/customer-api";
type S = components["schemas"];
const credentials = {
  email: securityFixture.email,
  password: securityFixture.password,
};
const cardId = "card_aster_debit";
let security: SecurityService, cards: CardService;
beforeEach(() => {
  bankingStore.reset();
  security = new SecurityService(bankingStore, () => "012345");
  cards = new CardService(bankingStore);
});
const reference = (intent: S["CardActionIntent"]) => ({
  intentId: intent.id,
  intentHash: intent.intentHash,
});
async function prepare(action: "UNFREEZE" | "UPDATE_CONTROLS" = "UNFREEZE") {
  security.login(credentials);
  const initial = await cards.prepare(
    action === "UNFREEZE"
      ? { cardId, actionType: "FREEZE" }
      : {
          cardId,
          actionType: "UPDATE_CONTROLS",
          controls: { ...cards.card(cardId).controls, onlinePayments: false },
        },
  );
  const grant =
    action === "UPDATE_CONTROLS" ? await authorize(initial) : undefined;
  cards.execute(
    { ...reference(initial), actionAuthorizationId: grant?.id },
    "protective",
  );
  return cards.prepare(
    action === "UNFREEZE"
      ? { cardId, actionType: action }
      : {
          cardId,
          actionType: action,
          controls: { ...cards.card(cardId).controls, onlinePayments: true },
        },
  );
}
function challenge(intent: S["CardActionIntent"]) {
  return security.createChallenge({
    actionType:
      intent.actionType === "UNFREEZE"
        ? "CARD_UNFREEZE"
        : intent.authorizationRequirement === "STEP_UP_AUTH"
          ? "CARD_CONTROL_RISK_INCREASING"
          : "CARD_CONTROL_PROTECTIVE",
    resourceType: "CARD_ACTION_INTENT",
    resourceId: intent.id,
    resourceHash: intent.intentHash,
  });
}
async function authorize(intent: S["CardActionIntent"]) {
  const c = await challenge(intent);
  return (
    await security.verify(c.id, {
      code: "012345",
      password: credentials.password,
    })
  ).authorization;
}
it("valid login issues a simulated AAL1 session without secrets", () => {
  const session = security.login(credentials);
  expect(session).toMatchObject({
    authenticated: true,
    status: "ACTIVE",
    assuranceLevel: "AAL1",
    mode: "SIMULATED_AUTH",
  });
  expect(security.session()).toEqual(session);
  expect(JSON.stringify(session)).not.toContain(securityFixture.password);
});
it("invalid login is denied and records no password or code", () => {
  expect(() => security.login({ ...credentials, password: "wrong" })).toThrow();
  expect(bankingStore.read().currentSessionId).toBeNull();
  expect(bankingStore.read().securityEvents.map((e) => e.type)).toEqual([
    "LOGIN_FAILURE",
  ]);
  expect(JSON.stringify(bankingStore.read())).not.toContain('"password"');
});
it.each([
  "overview",
  "accounts",
  "transactions",
  "cards",
  "spending/summary",
  "wealth/portfolio",
  "session",
])("protects unauthenticated API %s", async (path) => {
  await expect(apiGet(`/customer/${path}`)).rejects.toMatchObject({
    status: 401,
    code: "UNAUTHENTICATED",
  });
});
it("login endpoint and logout revoke session, pending challenges and active grants", async () => {
  await apiPost("/customer/auth/login", credentials);
  const i = await prepare();
  const auth = await authorize(i);
  const c = await challenge(i);
  await apiPost("/customer/auth/logout", {});
  expect(bankingStore.read().stepUpChallenges[c.id].status).toBe("CANCELLED");
  expect(bankingStore.read().actionAuthorizations[auth.id].status).toBe(
    "REVOKED",
  );
  await expect(apiGet("/customer/accounts")).rejects.toMatchObject({
    status: 401,
    code: "SESSION_REVOKED",
  });
});
it("deterministic session expiration blocks reads and writes", async () => {
  security.login(credentials);
  bankingStore.clock.advance(60 * 60_000);
  await expect(apiGet("/customer/overview")).rejects.toMatchObject({
    status: 401,
    code: "SESSION_EXPIRED",
  });
  await expect(apiPost("/customer/card-actions", {})).rejects.toMatchObject({
    status: 401,
    code: "SESSION_EXPIRED",
  });
  expect(Object.values(bankingStore.read().sessions)[0].status).toBe("EXPIRED");
});
it("challenge carries exact binding, three attempts and no correct code", async () => {
  const i = await prepare(),
    c = await challenge(i);
  expect(c).toMatchObject({
    resourceType: "CARD_ACTION_INTENT",
    resourceId: i.id,
    resourceHash: i.intentHash,
    status: "PENDING",
    attemptsRemaining: 3,
  });
  expect(JSON.stringify(c)).not.toContain("012345");
  expect(c).not.toHaveProperty("sessionId");
});
it("wrong codes decrement attempts and permanently fail at zero", async () => {
  const c = await challenge(await prepare());
  for (let n = 2; n >= 0; n--) {
    await expect(security.verify(c.id, { code: "wrong" })).rejects.toThrow();
    expect(security.challenge(c.id).attemptsRemaining).toBe(n);
  }
  expect(security.challenge(c.id).status).toBe("FAILED");
  await expect(
    security.verify(c.id, { code: "012345", password: credentials.password }),
  ).rejects.toThrow(
    expect.objectContaining({ code: "STEP_UP_CHALLENGE_FAILED" }),
  );
  expect(Object.keys(bankingStore.read().actionAuthorizations)).toHaveLength(0);
});
it("expired challenge cannot issue an authorization", async () => {
  const c = await challenge(await prepare());
  bankingStore.clock.advance(5 * 60_000);
  await expect(
    security.verify(c.id, { code: "012345", password: credentials.password }),
  ).rejects.toThrow(
    expect.objectContaining({ code: "STEP_UP_CHALLENGE_EXPIRED" }),
  );
});
it("successful verification issues AAL2 grant without globally elevating session", async () => {
  const i = await prepare(),
    a = await authorize(i);
  expect(a).toMatchObject({
    resourceId: i.id,
    resourceHash: i.intentHash,
    assuranceLevel: "AAL2",
    status: "ACTIVE",
    consumedAt: null,
  });
  expect(security.session().assuranceLevel).toBe("AAL1");
  expect(Date.parse(a.expiresAt) - Date.parse(a.issuedAt)).toBe(120_000);
});
it.each(["UNFREEZE", "UPDATE_CONTROLS"] as const)(
  "%s requires and consumes exact action authorization",
  async (action) => {
    const i = await prepare(action);
    expect(() => cards.execute(reference(i), "blocked")).toThrow(
      expect.objectContaining({ code: "STEP_UP_AUTH_REQUIRED" }),
    );
    const a = await authorize(i);
    const receipt = cards.execute(
      { ...reference(i), actionAuthorizationId: a.id },
      "execute",
    );
    expect(receipt.status).toBe("COMPLETED");
    expect(cards.card(cardId).status).toBe("ACTIVE");
    expect(cards.card(cardId).controls.onlinePayments).toBe(true);
    expect(bankingStore.read().actionAuthorizations[a.id]).toMatchObject({
      status: "CONSUMED",
      consumedAt: receipt.completedAt,
    });
  },
);
it.each(["id", "hash"])(
  "authorization rejects a different intent %s",
  async (field) => {
    const i = await prepare(),
      a = await authorize(i),
      other = await cards.prepare({ cardId, actionType: "UNFREEZE" });
    const request =
      field === "id"
        ? reference(other)
        : { ...reference(i), intentHash: "tampered" };
    expect(() =>
      cards.execute({ ...request, actionAuthorizationId: a.id }, "mismatch"),
    ).toThrow(
      expect.objectContaining({ code: "ACTION_AUTHORIZATION_MISMATCH" }),
    );
    expect(bankingStore.read().actionAuthorizations[a.id].status).toBe(
      "ACTIVE",
    );
  },
);
it("challenge cannot be created for a forged hash", async () => {
  const i = await prepare();
  await expect(
    security.createChallenge({
      actionType: "CARD_UNFREEZE",
      resourceType: "CARD_ACTION_INTENT",
      resourceId: i.id,
      resourceHash: "tampered",
    }),
  ).rejects.toThrow(
    expect.objectContaining({ code: "ACTION_AUTHORIZATION_MISMATCH" }),
  );
});
it("authorization expires exactly at its boundary", async () => {
  const i = await prepare(),
    a = await authorize(i);
  bankingStore.clock.advance(120_000);
  expect(() =>
    cards.execute({ ...reference(i), actionAuthorizationId: a.id }, "expired"),
  ).toThrow(expect.objectContaining({ code: "ACTION_AUTHORIZATION_EXPIRED" }));
  expect(cards.card(cardId).status).toBe("FROZEN");
});
it("single use blocks a new key but safe replay returns the original receipt", async () => {
  const i = await prepare(),
    a = await authorize(i),
    request = { ...reference(i), actionAuthorizationId: a.id };
  const receipt = cards.execute(request, "same");
  expect(cards.execute(request, "same")).toEqual(receipt);
  expect(() => cards.execute(request, "another")).toThrow(
    expect.objectContaining({ code: "ACTION_AUTHORIZATION_CONSUMED" }),
  );
  expect(() =>
    cards.execute({ ...request, actionAuthorizationId: "different" }, "same"),
  ).toThrow(expect.objectContaining({ code: "IDEMPOTENCY_KEY_REUSED" }));
  expect(
    bankingStore
      .read()
      .securityEvents.filter((e) => e.type === "AUTHORIZATION_CONSUMED"),
  ).toHaveLength(1);
});
it("stale card state remains blocked after successful verification", async () => {
  const i = await prepare(),
    a = await authorize(i),
    state = bankingStore.read();
  state.cards[0].version++;
  bankingStore.commit(state);
  expect(() =>
    cards.execute({ ...reference(i), actionAuthorizationId: a.id }, "stale"),
  ).toThrow(expect.objectContaining({ code: "CARD_STATE_CHANGED" }));
  expect(bankingStore.read().actionAuthorizations[a.id].status).toBe("ACTIVE");
});
it.each(["missing", "assurance", "revoked"])(
  "rejects %s authorization",
  async (variant) => {
    const i = await prepare(),
      a = await authorize(i);
    const state = bankingStore.read();
    if (variant === "assurance")
      state.actionAuthorizations[a.id].assuranceLevel = "AAL1";
    if (variant === "revoked")
      state.actionAuthorizations[a.id].status = "REVOKED";
    bankingStore.commit(state);
    expect(() =>
      cards.execute(
        {
          ...reference(i),
          actionAuthorizationId: variant === "missing" ? "missing" : a.id,
        },
        "bad",
      ),
    ).toThrow(
      expect.objectContaining({
        code:
          variant === "missing"
            ? "ACTION_AUTHORIZATION_NOT_FOUND"
            : "INSUFFICIENT_AUTH_ASSURANCE",
      }),
    );
  },
);
it("new session cannot use the old grant or read old challenge", async () => {
  const i = await prepare(),
    c = await challenge(i),
    a = await authorize(i);
  security.login(credentials);
  expect(() => security.challenge(c.id)).toThrow(
    expect.objectContaining({ code: "STEP_UP_CHALLENGE_NOT_FOUND" }),
  );
  expect(() =>
    cards.execute({ ...reference(i), actionAuthorizationId: a.id }, "session"),
  ).toThrow(expect.objectContaining({ code: "ACTION_AUTHORIZATION_MISMATCH" }));
});
it("verification cannot be reused to mint more grants", async () => {
  const c = await challenge(await prepare());
  await security.verify(c.id, {
    code: "012345",
    password: credentials.password,
  });
  await expect(
    security.verify(c.id, { code: "012345", password: credentials.password }),
  ).rejects.toThrow();
  expect(Object.keys(bankingStore.read().actionAuthorizations)).toHaveLength(1);
});
it("auth has no cross-domain financial effects and all security events are machine readable", async () => {
  const i = await prepare(),
    before = bankingStore.read(),
    c = await challenge(i);
  await expect(security.verify(c.id, { code: "wrong" })).rejects.toThrow();
  await security.verify(c.id, {
    code: "012345",
    password: credentials.password,
  });
  security.logout();
  const after = bankingStore.read();
  for (const key of [
    "accounts",
    "transactions",
    "portfolio",
    "overview",
    "recurringPayments",
    "asOf",
    "revision",
    "cards",
  ] as const)
    expect(after[key]).toEqual(before[key]);
  expect(after.securityEvents.map((e) => e.type)).toEqual(
    expect.arrayContaining([
      "LOGIN_SUCCESS",
      "STEP_UP_CREATED",
      "STEP_UP_FAILED",
      "STEP_UP_VERIFIED",
      "AUTHORIZATION_ISSUED",
      "LOGOUT",
    ]),
  );
  expect(JSON.stringify(after.securityEvents)).not.toContain(
    securityFixture.password,
  );
  expect(JSON.stringify(after.securityEvents)).not.toContain("012345");
});
it("reset isolates all sessions, challenges and grants", async () => {
  await authorize(await prepare());
  bankingStore.reset();
  const s = bankingStore.read();
  expect(s.sessions).toEqual({});
  expect(s.stepUpChallenges).toEqual({});
  expect(s.actionAuthorizations).toEqual({});
  expect(s.securityEvents).toEqual([]);
  expect(() => security.session()).toThrow();
});
it("atomic persistence failure changes neither card nor authorization", async () => {
  const i = await prepare(),
    a = await authorize(i),
    before = bankingStore.read();
  const store = new MockBankingStore();
  store.commit(before);
  store.enablePersistence({
    getItem: () => null,
    setItem: () => {
      throw new Error("full");
    },
  });
  expect(() =>
    new CardService(store).execute(
      { ...reference(i), actionAuthorizationId: a.id },
      "storage",
    ),
  ).toThrow(expect.objectContaining({ code: "PERSISTENCE_UNAVAILABLE" }));
  expect(store.read()).toEqual(before);
});

it("AAL2 on a session alone never authorizes an arbitrary sensitive action", async () => {
  const i = await prepare();
  const state = bankingStore.read();
  state.sessions[state.currentSessionId!].assuranceLevel = "AAL2";
  bankingStore.commit(state);
  expect(() => cards.execute(reference(i), "aal2-session")).toThrow(
    expect.objectContaining({ code: "STEP_UP_AUTH_REQUIRED" }),
  );
});
it("same-key replay survives authorization expiry while a fresh key is denied", async () => {
  const i = await prepare(),
    a = await authorize(i),
    request = { ...reference(i), actionAuthorizationId: a.id };
  const receipt = cards.execute(request, "network-retry");
  bankingStore.clock.advance(120_000);
  expect(cards.execute(request, "network-retry")).toEqual(receipt);
  expect(() => cards.execute(request, "fresh")).toThrow(
    expect.objectContaining({ code: "ACTION_AUTHORIZATION_CONSUMED" }),
  );
});
it("M7 migration preserves financial state but does not import authentication", () => {
  const state = bankingStore.read();
  const legacy = JSON.parse(
    JSON.stringify({
      ...state,
      version: 7,
      session: { user: { id: "old", displayName: "Old session" } },
    }),
  );
  delete legacy.sessions;
  delete legacy.stepUpChallenges;
  delete legacy.actionAuthorizations;
  delete legacy.securityEvents;
  delete legacy.currentSessionId;
  const store = new MockBankingStore();
  store.enablePersistence({
    getItem: () => JSON.stringify(legacy),
    setItem: () => undefined,
  });
  expect(store.read().version).toBe(8);
  expect(store.read().accounts).toEqual(state.accounts);
  expect(store.read().portfolio).toEqual(state.portfolio);
  expect(store.read().currentSessionId).toBeNull();
  expect(store.read()).not.toHaveProperty("session");
});

it("temporary test login uses the existing demo customer with normal AAL1 privileges", () => {
  const original = security.login(credentials);
  const session = security.login(temporaryTestCredential);
  expect(session.user).toEqual(original.user);
  expect(session.assuranceLevel).toBe("AAL1");
  expect(session.id).not.toBe(original.id);
  expect(JSON.stringify(session)).not.toContain(temporaryTestCredential.email);
  expect(JSON.stringify(bankingStore.read())).not.toContain('"password"');
  security.logout();
  expect(() => security.session()).toThrow();
});
it.each([
  { email: temporaryTestCredential.email, password: "wrong" },
  { email: temporaryTestCredential.email, password: securityFixture.password },
  { email: securityFixture.email, password: temporaryTestCredential.password },
])(
  "temporary credentials cannot be mixed with existing credentials",
  (input) => {
    expect(() => security.login(input)).toThrow();
    expect(bankingStore.read().currentSessionId).toBeNull();
  },
);
