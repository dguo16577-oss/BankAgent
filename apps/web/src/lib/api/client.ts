import type { components } from "@/generated/customer-api";
import type { components as PublicComponents } from "@/generated/public-api";
import { apiRuntime } from "./runtime";
import { attachCsrfHeader, getCsrfToken } from "./csrf";
import { customerRevision } from "./customer-lifecycle";
import { RequestTimeout, withDeadline } from "./deadline";
type ApiErrorBody =
  | components["schemas"]["ApiError"]
  | PublicComponents["schemas"]["PublicApiError"];

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly kind: "http" | "network" | "parse",
    public readonly code?: ApiErrorBody["code"],
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  return apiRequest<T>(path, { signal });
}

export function apiPost<T>(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return apiRequest<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}
async function apiRequest<T>(path: string, options: RequestInit): Promise<T> {
  try {
    return await withDeadline(
      (signal) => performRequest<T>(path, { ...options, signal }),
      options.signal,
    );
  } catch (error) {
    if (error instanceof RequestTimeout)
      throw new ApiError(error.message, 0, "network");
    throw error;
  }
}

async function performRequest<T>(
  path: string,
  options: RequestInit,
): Promise<T> {
  const runtime = apiRuntime();
  if (!/^\/(customer|public)\//.test(path))
    throw new Error("API path must belong to Customer or Public.");
  const customer = path.startsWith("/customer/");
  const revision = customerRevision();
  const checkIdentity = () => {
    if (customer && revision !== customerRevision())
      throw new ApiError(
        "Your session changed. Please retry after signing in.",
        401,
        "http",
        "UNAUTHENTICATED",
      );
  };
  const mutation = !["GET", "HEAD"].includes(options.method ?? "GET");
  if (runtime.mode === "backend" && customer && mutation && !getCsrfToken())
    await bootstrapCsrf();
  checkIdentity();
  const signal = options.signal;
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (runtime.mode === "backend" && customer && mutation)
    attachCsrfHeader(headers);
  let response: Response;
  try {
    response = await fetch(`${runtime.baseUrl}${path}`, {
      ...options,
      credentials: customer ? "include" : "omit",
      cache: "no-store",
      headers,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(
      "Unable to reach the API. Please try again.",
      0,
      "network",
    );
  }
  checkIdentity();
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    checkIdentity();
    if (
      response.status === 401 &&
      customer &&
      path !== "/customer/auth/login" &&
      path !== "/customer/session" &&
      typeof window !== "undefined"
    ) {
      const code =
        typeof body === "object" && body && "code" in body
          ? body.code
          : "UNAUTHENTICATED";
      window.dispatchEvent(
        new CustomEvent("bank-session-invalid", { detail: code }),
      );
    }
    if (
      typeof body === "object" &&
      body !== null &&
      "code" in body &&
      "message" in body &&
      typeof body.message === "string" &&
      (body.code === "APPLICATION_NOT_FOUND" ||
        body.code === "APPLICATION_ALREADY_SUBMITTED" ||
        body.code === "PRODUCT_NOT_APPLICABLE" ||
        body.code === "ACCOUNT_NOT_FOUND" ||
        body.code === "INTERNAL_ERROR" ||
        body.code === "TRANSACTION_NOT_FOUND" ||
        body.code === "INVALID_QUERY" ||
        body.code === "INVALID_CURSOR" ||
        errorCodes.includes(body.code as ApiErrorBody["code"]))
    ) {
      // Refresh security state, but never replay a mutation automatically.
      if (
        runtime.mode === "backend" &&
        customer &&
        response.status === 403 &&
        body.code === "INVALID_REQUEST"
      )
        await bootstrapCsrf().catch(() => undefined);
      throw new ApiError(
        body.message,
        response.status,
        "http",
        body.code as ApiErrorBody["code"],
        response.headers.get("X-Correlation-Id") ?? undefined,
      );
    }
    throw new ApiError(
      "The API request failed.",
      response.status,
      "http",
      undefined,
      response.headers.get("X-Correlation-Id") ?? undefined,
    );
  }
  let data: T;
  try {
    data = (await response.json()) as T;
  } catch {
    throw new ApiError(
      "The API returned invalid JSON.",
      response.status,
      "parse",
      undefined,
      response.headers.get("X-Correlation-Id") ?? undefined,
    );
  }
  checkIdentity();
  return data;
}

let csrfBootstrap: Promise<void> | undefined;
export function bootstrapCsrf(): Promise<void> {
  if (apiRuntime().mode === "mock") return Promise.resolve();
  csrfBootstrap ??= withDeadline(async (signal) => {
    let response: Response;
    try {
      response = await fetch(`${apiRuntime().baseUrl}/customer/session`, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal,
      });
    } catch {
      throw new ApiError(
        "Unable to reach the API. Please try again.",
        0,
        "network",
      );
    }
    // Anonymous 401 is the documented CSRF bootstrap response, not a login failure.
    if (!response.ok && response.status !== 401)
      throw new ApiError(
        "Security state could not be initialized. Please retry.",
        response.status,
        "http",
        undefined,
        response.headers.get("X-Correlation-Id") ?? undefined,
      );
    if (!getCsrfToken())
      throw new ApiError(
        "Security cookie is unavailable. Check browser cookies and retry.",
        0,
        "http",
      );
  })
    .catch((error: unknown) => {
      if (error instanceof RequestTimeout)
        throw new ApiError(error.message, 0, "network");
      throw error;
    })
    .finally(() => {
      csrfBootstrap = undefined;
    });
  return csrfBootstrap;
}

const errorCodes: ApiErrorBody["code"][] = [
  "PUBLIC_CONTENT_UNAVAILABLE",
  "PUBLIC_CONTENT_NOT_FOUND",
  "INVALID_PUBLIC_QUERY",
  "INVALID_CREDENTIALS",
  "UNAUTHENTICATED",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "STEP_UP_CHALLENGE_NOT_FOUND",
  "STEP_UP_CHALLENGE_EXPIRED",
  "STEP_UP_CHALLENGE_FAILED",
  "INVALID_STEP_UP_CODE",
  "INVALID_VERIFICATION",
  "VERIFICATION_UNAVAILABLE",
  "PHONE_NOT_VERIFIED",
  "DEMO_SMS_UNAVAILABLE",
  "ACTION_AUTHORIZATION_NOT_FOUND",
  "ACTION_AUTHORIZATION_EXPIRED",
  "ACTION_AUTHORIZATION_CONSUMED",
  "ACTION_AUTHORIZATION_MISMATCH",
  "INSUFFICIENT_AUTH_ASSURANCE",
  "INVESTMENT_PRODUCT_NOT_FOUND",
  "INVESTMENT_PRODUCT_UNAVAILABLE",
  "RISK_PROFILE_NOT_FOUND",
  "RISK_PROFILE_EXPIRED",
  "SUITABILITY_CHECK_NOT_FOUND",
  "SUITABILITY_CHECK_EXPIRED",
  "SUITABILITY_CHECK_MISMATCH",
  "PRODUCT_NOT_SUITABLE",
  "INVESTMENT_AMOUNT_BELOW_MINIMUM",
  "INVESTMENT_INTENT_NOT_FOUND",
  "INVESTMENT_INTENT_EXPIRED",
  "INVESTMENT_INTENT_HASH_MISMATCH",
  "INVESTMENT_INTENT_ALREADY_EXECUTED",
  "INVESTMENT_STATE_CHANGED",
  "INVESTMENT_ORDER_NOT_FOUND",

  "RECURRING_PAYMENT_NOT_FOUND",
  "RECURRING_PAYMENT_NOT_MANAGEABLE",
  "RECURRING_PAYMENT_ALREADY_STOPPED",
  "RECURRING_PAYMENT_STATE_CHANGED",
  "RECURRING_PAYMENT_INTENT_NOT_FOUND",
  "RECURRING_PAYMENT_INTENT_EXPIRED",
  "RECURRING_PAYMENT_INTENT_HASH_MISMATCH",
  "RECURRING_PAYMENT_INTENT_ALREADY_EXECUTED",
  "RECURRING_PAYMENT_ACTION_NOT_FOUND",

  "CARD_NOT_FOUND",
  "CARD_NOT_ELIGIBLE",
  "CARD_STATE_CHANGED",
  "NO_CARD_CHANGES",
  "CARD_ACTION_INTENT_NOT_FOUND",
  "CARD_ACTION_INTENT_EXPIRED",
  "CARD_ACTION_INTENT_HASH_MISMATCH",
  "CARD_ACTION_INTENT_ALREADY_EXECUTED",
  "CARD_ACTION_NOT_FOUND",
  "STEP_UP_AUTH_REQUIRED",
  "ACCOUNT_NOT_ELIGIBLE",
  "RECIPIENT_NOT_FOUND",
  "RECIPIENT_INACTIVE",
  "RECIPIENT_ALREADY_EXISTS",
  "RECIPIENT_STATE_CHANGED",
  "SCHEDULE_NOT_FOUND",
  "SCHEDULE_STATE_CHANGED",
  "SCHEDULE_ALREADY_DUE",
  "INVALID_SCHEDULE_TIME",
  "SCHEDULE_INTENT_NOT_FOUND",
  "SCHEDULE_INTENT_HASH_MISMATCH",
  "SCHEDULE_INTENT_UNAVAILABLE",
  "SCHEDULE_TERMS_INVALID",

  "RECIPIENT_INTENT_NOT_FOUND",
  "RECIPIENT_INTENT_EXPIRED",
  "RECIPIENT_INTENT_ALREADY_EXECUTED",
  "RECIPIENT_INTENT_HASH_MISMATCH",
  "TRANSFER_SESSION_MISMATCH",
  "INVALID_DESTINATION",

  "RECIPIENT_NOT_ELIGIBLE",
  "INVALID_AMOUNT",
  "CURRENCY_MISMATCH",
  "INSUFFICIENT_FUNDS",
  "TRANSFER_INTENT_NOT_FOUND",
  "TRANSFER_INTENT_EXPIRED",
  "TRANSFER_INTENT_HASH_MISMATCH",
  "TRANSFER_INTENT_ALREADY_EXECUTED",
  "IDEMPOTENCY_KEY_REUSED",
  "TRANSFER_NOT_FOUND",
  "INVALID_REQUEST",
  "PERSISTENCE_UNAVAILABLE",
];
