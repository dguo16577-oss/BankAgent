import { http } from "msw";
import { respond } from "./api-response";
import { bankingStore } from "./bank/store";
import { SecurityService, consumeVerification } from "./bank/security-service";
import { hash, fail, record } from "./bank/service-support";
import { catalog } from "./public/catalog";
import type { components } from "@/generated/customer-api";
import { minor } from "./bank/amount";
type S = components["schemas"];
const security = new SecurityService(bankingStore);
const invalid = () =>
  fail("INVALID_REQUEST", 400, "Check the application details.");
const detailKeys = [
  "cardUsage",
  "employmentStatus",
  "savingsGoal",
  "plannedMonthlyContribution",
  "coverageAmount",
  "beneficiaryRelationship",
  "householdSize",
  "tripStartDate",
  "tripEndDate",
  "propertyType",
];
function detailsFor(
  value: unknown,
  productId: string,
  type: string,
): S["ProductApplicationDetails"] {
  record(value, detailKeys, []);
  const d = value as Record<string, unknown>;
  const select = (
    key: string,
    required: boolean,
    allowed: readonly string[],
  ) => {
    if (
      required !== Object.hasOwn(d, key) ||
      (required && (typeof d[key] !== "string" || !allowed.includes(d[key])))
    )
      invalid();
  };
  const amount = (key: string, required: boolean, min: number, max: number) => {
    if (required !== Object.hasOwn(d, key)) invalid();
    if (required) validateMoney(d[key], BigInt(min), BigInt(max));
  };
  select("cardUsage", ["DEBIT_CARD", "CREDIT_CARD"].includes(type), [
    "EVERYDAY",
    "TRAVEL",
    "ONLINE",
  ]);
  select(
    "employmentStatus",
    ["CREDIT_CARD", "PERSONAL_LOAN", "MORTGAGE", "OVERDRAFT"].includes(type),
    ["EMPLOYED", "SELF_EMPLOYED", "STUDENT", "RETIRED", "OTHER"],
  );
  select("savingsGoal", type === "SAVINGS_ACCOUNT", [
    "EMERGENCY",
    "PLANNED_PURCHASE",
    "GENERAL",
  ]);
  amount(
    "plannedMonthlyContribution",
    type === "SAVINGS_ACCOUNT",
    100,
    100000000,
  );
  const life = productId === "life-insurance",
    health = productId === "health-insurance",
    travel = productId === "travel-insurance",
    home = productId === "home-insurance";
  if (type === "INSURANCE_PRODUCT" && !(life || health || travel || home))
    invalid();
  amount("coverageAmount", life || health || home, 1000000, 1000000000);
  select("beneficiaryRelationship", life, [
    "SPOUSE",
    "CHILD",
    "PARENT",
    "OTHER",
  ]);
  select("propertyType", home || type === "MORTGAGE", [
    "APARTMENT",
    "HOUSE",
    "OTHER",
  ]);
  if (
    health !== Object.hasOwn(d, "householdSize") ||
    (health &&
      (!Number.isInteger(d.householdSize) ||
        Number(d.householdSize) < 1 ||
        Number(d.householdSize) > 10))
  )
    invalid();
  if (travel) {
    if (
      typeof d.tripStartDate !== "string" ||
      typeof d.tripEndDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(d.tripStartDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(d.tripEndDate) ||
      !Number.isFinite(Date.parse(d.tripStartDate)) ||
      !Number.isFinite(Date.parse(d.tripEndDate)) ||
      new Date(d.tripStartDate).toISOString().slice(0, 10) !==
        d.tripStartDate ||
      new Date(d.tripEndDate).toISOString().slice(0, 10) !== d.tripEndDate ||
      d.tripEndDate <= d.tripStartDate ||
      (Date.parse(d.tripEndDate) - Date.parse(d.tripStartDate)) / 86400000 > 365
    )
      invalid();
  } else if (
    Object.hasOwn(d, "tripStartDate") ||
    Object.hasOwn(d, "tripEndDate")
  )
    invalid();
  return d as S["ProductApplicationDetails"];
}
function validateMoney(value: unknown, min: bigint, max: bigint): S["Money"] {
  record(value, ["amount", "currency"], ["amount", "currency"]);
  if (
    typeof value.amount !== "string" ||
    !/^(0|[1-9][0-9]{0,7})\.[0-9]{2}$/.test(value.amount) ||
    value.currency !== "CNY"
  )
    return invalid();
  const amount = minor(value.amount);
  if (amount < min || amount > max) return invalid();
  return { amount: value.amount, currency: "CNY" };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export const applicationHandlers = [
  http.post("/customer/application-intents", ({ request }) =>
    respond(async () => {
      const session = security.session();
      const body = await request.json();
      record(
        body,
        [
          "productId",
          "accountId",
          "contactEmail",
          "consent",
          "monthlyIncome",
          "requestedAmount",
          "termMonths",
          "purpose",
          "applicationDetails",
        ],
        ["productId", "accountId", "contactEmail", "consent"],
      );
      const product = catalog.find((p) => p.id === body.productId);
      if (
        !product ||
        ![
          "DEBIT_CARD",
          "CREDIT_CARD",
          "PERSONAL_LOAN",
          "MORTGAGE",
          "OVERDRAFT",
          "SAVINGS_ACCOUNT",
          "INSURANCE_PRODUCT",
        ].includes(product.type)
      )
        return fail("PRODUCT_NOT_APPLICABLE", 422, "Product unavailable.");
      if (
        typeof body.accountId !== "string" ||
        typeof body.contactEmail !== "string" ||
        body.contactEmail.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contactEmail) ||
        body.consent !== true
      )
        return invalid();
      const account = bankingStore
        .read()
        .accounts.find((a) => a.id === body.accountId);
      if (!account) return fail("ACCOUNT_NOT_FOUND", 404, "Account not found.");
      if (account.status !== "ACTIVE" || account.currency !== "CNY")
        return invalid();
      if (product.type === "OVERDRAFT" && account.type !== "CURRENT")
        return invalid();
      if (
        ["CREDIT_CARD", "PERSONAL_LOAN", "MORTGAGE", "OVERDRAFT"].includes(
          product.type,
        )
      )
        validateMoney(body.monthlyIncome, BigInt(100), BigInt(1000000000));
      else if (body.monthlyIncome !== undefined) return invalid();
      if (product.type === "PERSONAL_LOAN") {
        validateMoney(body.requestedAmount, BigInt(100000), BigInt(20000000));
        if (
          typeof body.termMonths !== "number" ||
          ![6, 12, 24, 36].includes(body.termMonths) ||
          typeof body.purpose !== "string" ||
          !["EDUCATION", "HOME_IMPROVEMENT", "PERSONAL"].includes(body.purpose)
        )
          return invalid();
      } else if (product.type === "MORTGAGE") {
        validateMoney(
          body.requestedAmount,
          BigInt(10000000),
          BigInt(500000000),
        );
        if (
          typeof body.termMonths !== "number" ||
          ![120, 240, 360].includes(body.termMonths) ||
          body.purpose !== "HOME_PURCHASE"
        )
          return invalid();
      } else if (product.type === "OVERDRAFT") {
        validateMoney(body.requestedAmount, BigInt(100000), BigInt(10000000));
        if (body.termMonths !== undefined || body.purpose !== undefined)
          return invalid();
      } else if (
        body.requestedAmount !== undefined ||
        body.termMonths !== undefined ||
        body.purpose !== undefined
      )
        return invalid();
      detailsFor(body.applicationDetails, product.id, product.type);
      const at = bankingStore.clock.now(),
        id = `application_intent_${crypto.randomUUID()}`;
      const actionType = ["PERSONAL_LOAN", "MORTGAGE", "OVERDRAFT"].includes(
        product.type,
      )
        ? "LOAN_APPLICATION_SUBMIT"
        : ["SAVINGS_ACCOUNT", "INSURANCE_PRODUCT"].includes(product.type)
          ? "PRODUCT_APPLICATION_SUBMIT"
          : "CARD_APPLICATION_SUBMIT";
      const intent: S["ApplicationIntent"] = {
        id,
        intentHash: await hash([id, session.id, body, actionType]),
        actionType,
        verificationRequirement:
          actionType === "LOAN_APPLICATION_SUBMIT"
            ? "PASSWORD_AND_SMS_OTP"
            : actionType === "PRODUCT_APPLICATION_SUBMIT"
              ? "PASSWORD"
              : "SMS_OTP",
        expiresAt: new Date(Date.parse(at) + 900000).toISOString(),
        request: body as S["PrepareApplicationIntentRequest"],
      };
      if (security.session().id !== session.id)
        return fail("UNAUTHENTICATED", 401, "Session changed.");
      const next = bankingStore.read();
      next.applicationIntents[id] = { ...intent, sessionId: session.id };
      bankingStore.commit(next);
      return intent;
    }),
  ),
  http.get("/customer/applications", () =>
    respond(() => {
      const owner = security.session().user.id;
      return {
        items: Object.values(bankingStore.read().applications)
          .filter((a) => a.owner === owner)
          .map((a) => a.application)
          .sort(
            (a, b) =>
              b.submittedAt.localeCompare(a.submittedAt) ||
              b.id.localeCompare(a.id),
          ),
      };
    }),
  ),
  http.get("/customer/applications/:id", ({ params }) =>
    respond(() => {
      const owner = security.session().user.id;
      const a = bankingStore.read().applications[String(params.id)];
      if (!a || a.owner !== owner)
        return fail("APPLICATION_NOT_FOUND", 404, "Application not found.");
      return a.application;
    }),
  ),
  http.post("/customer/applications", ({ request }) =>
    respond(async () => {
      const body: unknown = await request.json();
      record(
        body,
        [
          "productId",
          "accountId",
          "contactEmail",
          "consent",
          "monthlyIncome",
          "requestedAmount",
          "termMonths",
          "purpose",
          "applicationDetails",
          "intentId",
          "intentHash",
          "actionAuthorizationId",
        ],
        ["productId", "accountId", "contactEmail", "consent"],
      );
      const key = request.headers.get("Idempotency-Key");
      if (!key || !/^[A-Za-z0-9_-]{1,128}$/.test(key)) return invalid();
      if (
        typeof body.productId !== "string" ||
        typeof body.accountId !== "string" ||
        typeof body.contactEmail !== "string" ||
        body.contactEmail.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contactEmail) ||
        body.consent !== true
      )
        return invalid();
      const product = catalog.find((p) => p.id === body.productId);
      if (
        !product ||
        ![
          "DEBIT_CARD",
          "CREDIT_CARD",
          "PERSONAL_LOAN",
          "MORTGAGE",
          "OVERDRAFT",
          "SAVINGS_ACCOUNT",
          "INSURANCE_PRODUCT",
        ].includes(product.type)
      )
        return fail(
          "PRODUCT_NOT_APPLICABLE",
          422,
          "This product does not accept applications.",
        );
      if (
        typeof body.intentId !== "string" ||
        typeof body.intentHash !== "string" ||
        typeof body.actionAuthorizationId !== "string"
      )
        return fail("STEP_UP_AUTH_REQUIRED", 403, "Verification required.");
      const input: S["SubmitProductApplicationRequest"] = {
        intentId: body.intentId,
        intentHash: body.intentHash,
        actionAuthorizationId: body.actionAuthorizationId,
        productId: body.productId,
        accountId: body.accountId,
        contactEmail: body.contactEmail,
        consent: true,
      };
      if (
        ["CREDIT_CARD", "PERSONAL_LOAN", "MORTGAGE", "OVERDRAFT"].includes(
          product.type,
        )
      )
        input.monthlyIncome = validateMoney(
          body.monthlyIncome,
          BigInt(100),
          BigInt(1000000000),
        );
      else if (body.monthlyIncome !== undefined) return invalid();
      if (product.type === "PERSONAL_LOAN") {
        input.requestedAmount = validateMoney(
          body.requestedAmount,
          BigInt(100000),
          BigInt(20000000),
        );
        if (
          ![6, 12, 24, 36].includes(Number(body.termMonths)) ||
          typeof body.termMonths !== "number" ||
          typeof body.purpose !== "string" ||
          !["EDUCATION", "HOME_IMPROVEMENT", "PERSONAL"].includes(body.purpose)
        )
          return invalid();
        input.termMonths = body.termMonths as 6 | 12 | 24 | 36;
        input.purpose =
          body.purpose as S["SubmitProductApplicationRequest"]["purpose"];
      } else if (product.type === "MORTGAGE") {
        input.requestedAmount = validateMoney(
          body.requestedAmount,
          BigInt(10000000),
          BigInt(500000000),
        );
        if (
          typeof body.termMonths !== "number" ||
          ![120, 240, 360].includes(body.termMonths) ||
          body.purpose !== "HOME_PURCHASE"
        )
          return invalid();
        input.termMonths =
          body.termMonths as S["SubmitProductApplicationRequest"]["termMonths"];
        input.purpose = "HOME_PURCHASE";
      } else if (product.type === "OVERDRAFT") {
        input.requestedAmount = validateMoney(
          body.requestedAmount,
          BigInt(100000),
          BigInt(10000000),
        );
        if (body.termMonths !== undefined || body.purpose !== undefined)
          return invalid();
      } else if (
        body.requestedAmount !== undefined ||
        body.termMonths !== undefined ||
        body.purpose !== undefined
      )
        return invalid();
      input.applicationDetails = detailsFor(
        body.applicationDetails,
        product.id,
        product.type,
      );
      const owner = security.session().user.id;
      const state = bankingStore.read();
      const old = Object.values(state.applications).find(
        (a) => a.owner === owner && a.key === key,
      );
      if (old) {
        if (
          state.applicationIntents[input.intentId]?.sessionId !==
          state.currentSessionId
        )
          return fail(
            "ACTION_AUTHORIZATION_MISMATCH",
            403,
            "Review belongs to a different session.",
          );
        if (JSON.stringify(old.request) !== JSON.stringify(input))
          return fail(
            "IDEMPOTENCY_KEY_REUSED",
            409,
            "This retry key belongs to different details.",
          );
        return old.application;
      }
      const intent = state.applicationIntents[input.intentId];
      const {
        intentId: _,
        intentHash: __,
        actionAuthorizationId: ___,
        ...original
      } = input;
      void _;
      void __;
      void ___;
      if (
        !intent ||
        intent.sessionId !== state.currentSessionId ||
        intent.intentHash !== input.intentHash ||
        JSON.stringify(canonical(intent.request)) !==
          JSON.stringify(canonical(original))
      )
        return fail("ACTION_AUTHORIZATION_MISMATCH", 403, "Review changed.");
      if (Date.parse(bankingStore.clock.now()) >= Date.parse(intent.expiresAt))
        return fail("ACTION_AUTHORIZATION_EXPIRED", 403, "Review expired.");
      consumeVerification(
        state,
        input.actionAuthorizationId,
        input.intentId,
        input.intentHash,
        bankingStore.clock.now(),
        "APPLICATION_INTENT",
        intent.actionType,
      );
      const account = state.accounts.find((a) => a.id === input.accountId);
      if (!account) return fail("ACCOUNT_NOT_FOUND", 404, "Account not found.");
      if (account.status !== "ACTIVE" || account.currency !== "CNY")
        return invalid();
      if (product.type === "OVERDRAFT" && account.type !== "CURRENT")
        return invalid();
      if (
        Object.values(state.applications).some(
          (a) =>
            a.owner === owner && a.application.productId === input.productId,
        )
      )
        return fail(
          "APPLICATION_ALREADY_SUBMITTED",
          409,
          "You already have an application for this product. View My applications.",
        );
      const application: S["ProductApplication"] = {
        ...input,
        id: `application_${crypto.randomUUID()}`,
        productTitle: product.title,
        productType: product.type as S["ProductApplication"]["productType"],
        maskedAccountNumber: account.maskedAccountNumber,
        status: "SUBMITTED",
        submittedAt: bankingStore.clock.now(),
      };
      // Consent belongs to intake, not the response schema.
      for (const key of [
        "consent",
        "intentId",
        "intentHash",
        "actionAuthorizationId",
      ])
        Reflect.deleteProperty(application, key);
      state.applications[application.id] = {
        owner,
        key,
        request: input,
        application,
      };
      bankingStore.commit(state);
      return application;
    }, 201),
  ),
];
