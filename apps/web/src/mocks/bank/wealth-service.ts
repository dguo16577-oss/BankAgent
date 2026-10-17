import { consumeVerification } from "./security-service";
import type { components } from "@/generated/customer-api";
import { MockBankingStore, type BankingState } from "./store";
import { minor, decimal } from "./amount";
import { fail, hash, record } from "./service-support";
import {
  recalculatePortfolio,
  summarizeProduct,
} from "../data/wealth-fixtures";
type S = components["schemas"];
const ranks: Record<S["RiskLevel"], number> = {
  R1: 1,
  R2: 2,
  R3: 3,
  R4: 4,
  R5: 5,
};
const productTypes: S["InvestmentProductType"][] = [
  "MONEY_MARKET",
  "BOND_FUND",
  "BALANCED_FUND",
  "EQUITY_FUND",
];
function productOf(state: BankingState, id: string) {
  return (
    state.products.find((p) => p.id === id) ??
    fail("INVESTMENT_PRODUCT_NOT_FOUND", 404, "Investment product not found.")
  );
}
function profileOf(state: BankingState, now: string) {
  const profile =
    state.riskProfile ??
    fail("RISK_PROFILE_NOT_FOUND", 404, "Risk profile not found.");
  if (Date.parse(now) >= Date.parse(profile.expiresAt))
    fail("RISK_PROFILE_EXPIRED", 409, "The demo risk profile has expired.");
  return profile;
}
function parsePrepare(body: unknown): S["CreateInvestmentOrderIntentRequest"] {
  record(
    body,
    ["productId", "sourceAccountId", "amount", "suitabilityCheckId"],
    ["productId", "sourceAccountId", "amount", "suitabilityCheckId"],
  );
  if (
    typeof body.productId !== "string" ||
    !body.productId ||
    typeof body.sourceAccountId !== "string" ||
    !body.sourceAccountId ||
    typeof body.suitabilityCheckId !== "string" ||
    !body.suitabilityCheckId
  )
    fail(
      "INVALID_REQUEST",
      400,
      "Product, source account and suitability evidence are required.",
    );
  record(body.amount, ["amount", "currency"], ["amount", "currency"]);
  if (
    typeof body.amount.amount !== "string" ||
    !/^(0|[1-9]\d{0,11})\.\d{2}$/.test(body.amount.amount) ||
    minor(body.amount.amount) <= BigInt(0)
  )
    fail(
      "INVALID_AMOUNT",
      422,
      "Enter a positive amount with two decimal places, up to 12 whole digits.",
    );
  if (body.amount.currency !== "CNY" && body.amount.currency !== "USD")
    fail("CURRENCY_MISMATCH", 422, "Unsupported currency.");
  return structuredClone(body) as S["CreateInvestmentOrderIntentRequest"];
}
function prerequisites(
  state: BankingState,
  request: S["CreateInvestmentOrderIntentRequest"],
  now: string,
) {
  const product = productOf(state, request.productId);
  if (product.status !== "AVAILABLE")
    fail(
      "INVESTMENT_PRODUCT_UNAVAILABLE",
      422,
      "This demo product is unavailable.",
    );
  const source =
    state.accounts.find((a) => a.id === request.sourceAccountId) ??
    fail("ACCOUNT_NOT_FOUND", 404, "Source account not found.");
  if (source.status !== "ACTIVE")
    fail("ACCOUNT_NOT_ELIGIBLE", 422, "Source account must be ACTIVE.");
  if (
    source.currency !== product.currency ||
    request.amount.currency !== product.currency ||
    product.currency !== "CNY" ||
    product.fees.currency !== product.currency
  )
    fail(
      "CURRENCY_MISMATCH",
      422,
      "Choose a matching CNY account. Demo investment orders do not perform FX.",
    );
  if (minor(request.amount.amount) < minor(product.minimumInvestment.amount))
    fail(
      "INVESTMENT_AMOUNT_BELOW_MINIMUM",
      422,
      "The amount is below this product's minimum investment.",
    );
  const total = minor(request.amount.amount) + minor(product.fees.amount);
  if (minor(source.availableBalance.amount) < total)
    fail(
      "INSUFFICIENT_FUNDS",
      422,
      "Insufficient available funds for amount and fees.",
    );
  const profile = profileOf(state, now);
  const check = Object.hasOwn(
    state.suitabilityChecks,
    request.suitabilityCheckId,
  )
    ? state.suitabilityChecks[request.suitabilityCheckId]
    : undefined;
  if (!check)
    return fail(
      "SUITABILITY_CHECK_NOT_FOUND",
      404,
      "Suitability check not found.",
    );
  if (Date.parse(now) >= Date.parse(check.expiresAt))
    fail(
      "SUITABILITY_CHECK_EXPIRED",
      409,
      "Suitability evidence has expired. Create a new check.",
    );
  if (check.productId !== product.id || check.userId !== profile.userId)
    fail(
      "SUITABILITY_CHECK_MISMATCH",
      409,
      "Suitability evidence belongs to a different product or user.",
    );
  if (
    check.productVersion !== product.version ||
    check.riskProfileVersion !== profile.version ||
    check.userRiskLevel !== profile.riskLevel ||
    check.productRiskLevel !== product.riskLevel
  )
    fail(
      "INVESTMENT_STATE_CHANGED",
      409,
      "Product or risk profile changed. Check suitability and prepare again.",
    );
  // Recompute the Banking Core rule; never trust a client result or stale label.
  if (
    check.result !== "SUITABLE" ||
    ranks[product.riskLevel] > ranks[profile.riskLevel]
  )
    fail(
      "PRODUCT_NOT_SUITABLE",
      422,
      "This product is not suitable for the current demo risk profile.",
    );
  return { product, source, check, total };
}
export class WealthService {
  constructor(private store: MockBankingStore) {}
  portfolio() {
    return this.store.read().portfolio;
  }
  products(params = new URLSearchParams()): S["InvestmentProductsResponse"] {
    for (const key of params.keys())
      if (
        !["type", "riskLevel"].includes(key) ||
        params.getAll(key).length !== 1 ||
        !params.get(key)
      )
        fail(
          "INVALID_QUERY",
          400,
          "Unsupported, empty or repeated product filter.",
        );
    const type = params.get("type"),
      risk = params.get("riskLevel");
    if (
      (type && !productTypes.includes(type as S["InvestmentProductType"])) ||
      (risk && !Object.hasOwn(ranks, risk))
    )
      fail("INVALID_QUERY", 400, "Unknown product type or risk level.");
    return {
      items: this.store
        .read()
        .products.filter(
          (p) => (!type || p.type === type) && (!risk || p.riskLevel === risk),
        )
        .map(summarizeProduct),
    };
  }
  product(id: string) {
    return productOf(this.store.read(), id);
  }
  riskProfile() {
    return profileOf(this.store.read(), this.store.clock.now());
  }
  createCheck(body: unknown): S["SuitabilityCheck"] {
    record(body, ["productId"], ["productId"]);
    if (typeof body.productId !== "string" || !body.productId)
      fail("INVALID_REQUEST", 400, "Choose a product.");
    const next = this.store.read();
    const product = productOf(next, body.productId),
      profile = profileOf(next, this.store.clock.now());
    const result =
      ranks[product.riskLevel] <= ranks[profile.riskLevel]
        ? "SUITABLE"
        : "NOT_SUITABLE";
    const createdAt = this.store.clock.now();
    const check: S["SuitabilityCheck"] = {
      id: `suitability_${crypto.randomUUID()}`,
      productId: product.id,
      userId: profile.userId,
      userRiskLevel: profile.riskLevel,
      productRiskLevel: product.riskLevel,
      productVersion: product.version,
      riskProfileVersion: profile.version,
      result,
      reasons: [
        result === "SUITABLE"
          ? "Product risk is within the demo user's risk level. This is eligibility evidence, not an investment recommendation."
          : "Product risk exceeds the demo user's risk level. Purchasing this product is unavailable.",
      ],
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + 30 * 60000).toISOString(),
    };
    next.suitabilityChecks[check.id] = check;
    this.commit(next);
    return structuredClone(check);
  }
  check(id: string) {
    const checks = this.store.read().suitabilityChecks;
    return (
      (Object.hasOwn(checks, id) ? checks[id] : undefined) ??
      fail("SUITABILITY_CHECK_NOT_FOUND", 404, "Suitability check not found.")
    );
  }
  async prepare(body: unknown): Promise<S["InvestmentOrderIntent"]> {
    const request = parsePrepare(body);
    const { product, source, check, total } = prerequisites(
      this.store.read(),
      request,
      this.store.clock.now(),
    );
    const createdAt = this.store.clock.now();
    const terms = {
      id: `investment_intent_${crypto.randomUUID()}`,
      product,
      sourceAccount: source,
      amount: request.amount,
      fees: product.fees,
      totalDebit: { amount: decimal(total), currency: product.currency },
      suitabilityCheckId: check.id,
      suitability: check,
      projectedAvailableBalance: {
        amount: decimal(minor(source.availableBalance.amount) - total),
        currency: source.currency,
      },
      authorizationRequirement: "CONFIRMATION" as const,
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + 15 * 60000).toISOString(),
    };
    const intent: S["InvestmentOrderIntent"] = {
      ...terms,
      status: "PREPARED",
      intentHash: await hash(terms),
    };
    const next = this.store.read();
    next.investmentOrderIntents[intent.id] = intent;
    this.commit(next);
    return structuredClone(intent);
  }
  intent(id: string) {
    const map = this.store.read().investmentOrderIntents;
    const intent = Object.hasOwn(map, id) ? map[id] : undefined;
    if (!intent)
      return fail(
        "INVESTMENT_INTENT_NOT_FOUND",
        404,
        "Investment intent not found.",
      );
    if (
      intent.status === "PREPARED" &&
      Date.parse(this.store.clock.now()) >= Date.parse(intent.expiresAt)
    )
      intent.status = "EXPIRED";
    return intent;
  }
  order(id: string) {
    const map = this.store.read().investmentOrders;
    return (
      (Object.hasOwn(map, id) ? map[id] : undefined) ??
      fail("INVESTMENT_ORDER_NOT_FOUND", 404, "Investment order not found.")
    );
  }
  execute(body: unknown, key: string | null): S["InvestmentOrderReceipt"] {
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
    const request = body as S["ExecuteInvestmentOrderRequest"];
    const next = this.store.read();
    const previous = Object.hasOwn(next.investmentIdempotency, key)
      ? next.investmentIdempotency[key]
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
          "This key was used for a different investment order request.",
        );
      return structuredClone(next.investmentOrders[previous.orderId]);
    }
    const intent = Object.hasOwn(next.investmentOrderIntents, request.intentId)
      ? next.investmentOrderIntents[request.intentId]
      : undefined;
    if (!intent)
      return fail(
        "INVESTMENT_INTENT_NOT_FOUND",
        404,
        "Investment intent not found.",
      );
    if (intent.intentHash !== request.intentHash)
      fail(
        "INVESTMENT_INTENT_HASH_MISMATCH",
        409,
        "The reviewed investment intent does not match.",
      );
    if (intent.status === "EXECUTED")
      fail(
        "INVESTMENT_INTENT_ALREADY_EXECUTED",
        409,
        "This investment intent has already been executed.",
      );
    if (Date.parse(this.store.clock.now()) >= Date.parse(intent.expiresAt))
      fail(
        "INVESTMENT_INTENT_EXPIRED",
        409,
        "This investment intent has expired. Prepare a new order.",
      );
    const { product, source, check } = prerequisites(
      next,
      parsePrepare({
        productId: intent.product.id,
        sourceAccountId: intent.sourceAccount.id,
        amount: intent.amount,
        suitabilityCheckId: intent.suitabilityCheckId,
      }),
      this.store.clock.now(),
    );
    if (
      JSON.stringify(product) !== JSON.stringify(intent.product) ||
      JSON.stringify(source) !== JSON.stringify(intent.sourceAccount) ||
      JSON.stringify(check) !== JSON.stringify(intent.suitability)
    )
      fail(
        "INVESTMENT_STATE_CHANGED",
        409,
        "Reviewed product, account or suitability state changed. Prepare a new order.",
      );
    consumeVerification(
      next,
      request.actionAuthorizationId,
      request.intentId,
      request.intentHash,
      this.store.clock.now(),
      "INVESTMENT_ORDER_INTENT",
      "INVESTMENT_ORDER_EXECUTE",
    );
    const completedAt = new Date(
      Date.parse(this.store.clock.now()) + 1000,
    ).toISOString();
    const id = `investment_order_${++next.investmentSequence}`,
      transactionId = `txn_${id}`;
    let position = next.portfolio.positions.find(
      (p) => p.productId === product.id,
    );
    if (!position) {
      position = {
        id: `position_${crypto.randomUUID()}`,
        productId: product.id,
        displayName: product.displayName,
        type: product.type,
        currentValue: { amount: "0.00", currency: product.currency },
        investedAmount: { amount: "0.00", currency: product.currency },
        gainLoss: { amount: "0.00", currency: product.currency },
      };
      next.portfolio.positions.push(position);
    }
    const receipt: S["InvestmentOrderReceipt"] = {
      id,
      intentId: intent.id,
      status: "COMPLETED",
      product: summarizeProduct(product),
      sourceAccount: structuredClone(source),
      amount: intent.amount,
      fees: intent.fees,
      totalDebit: intent.totalDebit,
      suitabilityCheckId: check.id,
      reference: `ASTER-INVEST-${next.investmentSequence}`,
      completedAt,
      transactionId,
      positionId: position.id,
      dataSource: "SIMULATED",
    };
    source.balance.amount = decimal(
      minor(source.balance.amount) - minor(intent.totalDebit.amount),
    );
    source.availableBalance.amount = decimal(
      minor(source.availableBalance.amount) - minor(intent.totalDebit.amount),
    );
    position.currentValue.amount = decimal(
      minor(position.currentValue.amount) + minor(intent.amount.amount),
    );
    position.investedAmount.amount = decimal(
      minor(position.investedAmount.amount) + minor(intent.amount.amount),
    );
    next.portfolio.monthlyNetContributions.amount = decimal(
      minor(next.portfolio.monthlyNetContributions.amount) +
        minor(intent.amount.amount),
    );
    next.portfolio.asOf = completedAt;
    next.portfolio.version++;
    next.portfolio = recalculatePortfolio(next.portfolio);
    next.transactions.push({
      id: transactionId,
      accountId: source.id,
      title: `Investment · ${product.displayName}`,
      amount: intent.totalDebit,
      direction: "DEBIT",
      status: "COMPLETED",
      type: "INVESTMENT_PURCHASE",
      category: "INVESTMENT",
      occurredAt: completedAt,
      bookedAt: completedAt,
      reference: receipt.reference,
    });
    next.investmentOrders[id] = receipt;
    intent.status = "EXECUTED";
    Object.defineProperty(next.investmentIdempotency, key, {
      value: { request, orderId: id },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    next.asOf = completedAt;
    next.clockAt = completedAt;
    next.revision++;
    // No awaits from revalidation to this atomic persist-before-commit.
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
        "Demo state could not be saved. No investment change was committed; retry safely.",
      );
    }
  }
}
