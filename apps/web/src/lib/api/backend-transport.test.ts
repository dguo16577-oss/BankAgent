import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, bootstrapCsrf } from "./client";
import { parseApiRuntime } from "./runtime";
import { clearCustomerCache } from "./customer-cache";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_MODE", "backend");
  vi.stubEnv("NEXT_PUBLIC_BANKING_API_BASE_URL", "http://localhost:18080/");
  document.cookie = "XSRF-TOKEN=; Max-Age=0; Path=/";
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Correlation-Id": "correlation-test",
    },
  });

describe("explicit API runtime", () => {
  it("defaults to backend and normalizes an origin", () => {
    expect(parseApiRuntime(undefined, "http://localhost:18080/")).toEqual({
      mode: "backend",
      baseUrl: "http://localhost:18080",
    });
    expect(parseApiRuntime("mock")).toEqual({ mode: "mock", baseUrl: "" });
  });
  it.each([
    undefined,
    "invalid",
    "ftp://host",
    "https://user:pass@host",
    "http://host/api",
    "http://host?token=x",
  ])("rejects invalid backend base URL %s", (url) => {
    expect(() => parseApiRuntime("backend", url)).toThrow();
  });
  it("rejects unknown modes", () =>
    expect(() => parseApiRuntime("typo", "http://localhost:18080")).toThrow());
});
describe("real transport boundary", () => {
  it("does not let a late old-session 401 invalidate a newer identity", async () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    let complete!: (value: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
    );
    const request = apiGet("/customer/accounts");
    await clearCustomerCache(new QueryClient());
    complete(
      json({ code: "SESSION_EXPIRED", message: "Expired old identity" }, 401),
    );
    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("discards a late response after Customer cache invalidation", async () => {
    let complete!: (value: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
    );
    const request = apiGet("/customer/accounts");
    await clearCustomerCache(new QueryClient());
    complete(json({ items: [{ balance: "old identity" }] }));
    await expect(request).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });
  it("includes Customer cookies, omits Public cookies, and propagates abort signals", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => json({}));
    const controller = new AbortController();
    await apiGet("/customer/accounts", controller.signal);
    expect(fetcher).toHaveBeenLastCalledWith(
      "http://localhost:18080/customer/accounts",
      expect.objectContaining({
        credentials: "include",
        signal: expect.any(AbortSignal),
      }),
    );
    await apiGet("/public/rates");
    expect(fetcher).toHaveBeenLastCalledWith(
      "http://localhost:18080/public/rates",
      expect.objectContaining({ credentials: "omit" }),
    );
    expect(
      new Headers(fetcher.mock.calls[1][1]?.headers).has("X-XSRF-TOKEN"),
    ).toBe(false);
  });
  it("bootstraps from anonymous session, sends CSRF and preserves an idempotency key", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => {
        if (String(url).endsWith("/session")) {
          document.cookie = "XSRF-TOKEN=csrf-test; Path=/";
          return json({ code: "UNAUTHENTICATED" }, 401);
        }
        return json({ id: "receipt" });
      });
    await apiPost(
      "/customer/transfers",
      { intentId: "intent" },
      { "Idempotency-Key": "confirm_intent" },
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    const headers = new Headers(fetcher.mock.calls[1][1]?.headers);
    expect(headers.get("X-XSRF-TOKEN")).toBe("csrf-test");
    expect(headers.get("Idempotency-Key")).toBe("confirm_intent");
  });
  it("single-flights simultaneous CSRF bootstrap", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => {
        document.cookie = "XSRF-TOKEN=token; Path=/";
        return json({}, 401);
      });
    await Promise.all([bootstrapCsrf(), bootstrapCsrf(), bootstrapCsrf()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("refreshes CSRF on security rejection without replaying a mutation", async () => {
    document.cookie = "XSRF-TOKEN=stale; Path=/";
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        json(
          { code: "INVALID_REQUEST", message: "Security validation failed" },
          403,
        ),
      )
      .mockResolvedValueOnce(json({}));
    await expect(apiPost("/customer/transfers", {})).rejects.toMatchObject({
      status: 403,
      code: "INVALID_REQUEST",
      correlationId: "correlation-test",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
  });
  it("does not interpret domain 403 as logout or CSRF", async () => {
    document.cookie = "XSRF-TOKEN=token; Path=/";
    const dispatch = vi.spyOn(window, "dispatchEvent");
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        json({ code: "STEP_UP_AUTH_REQUIRED", message: "Verify" }, 403),
      );
    await expect(apiPost("/customer/card-actions", {})).rejects.toMatchObject({
      code: "STEP_UP_AUTH_REQUIRED",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("invalidates identity for Customer 401 only", async () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      json({ code: "UNAUTHENTICATED", message: "Sign in" }, 401),
    );
    await expect(apiGet("/customer/accounts")).rejects.toMatchObject({
      status: 401,
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    await expect(apiGet("/public/rates")).rejects.toMatchObject({
      status: 401,
    });
    await expect(apiGet("/customer/session")).rejects.toMatchObject({
      status: 401,
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it("reports network failure without mock fallback or retry", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("offline"));
    await expect(apiGet("/customer/accounts")).rejects.toMatchObject({
      kind: "network",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("preserves cancellation", async () => {
    const controller = new AbortController();
    const error = new DOMException("Aborted", "AbortError");
    controller.abort(error);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(error);
    await expect(apiGet("/customer/accounts", controller.signal)).rejects.toBe(
      error,
    );
  });
  it("clears all Customer data and mutation variables while preserving Public data", async () => {
    const client = new QueryClient();
    for (const key of [
      "session",
      "overview",
      "accounts",
      "step-up",
      "investment-orders",
    ])
      client.setQueryData([key], { sensitive: true });
    client.setQueryData(["public", "rates"], { anonymous: true });
    await clearCustomerCache(client);
    expect(
      client
        .getQueryCache()
        .getAll()
        .map((q) => q.queryKey),
    ).toEqual([["public", "rates"]]);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    client.clear();
  });
});
