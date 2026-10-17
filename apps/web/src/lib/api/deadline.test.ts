import { afterEach, expect, it, vi } from "vitest";
import { API_TIMEOUT_MS, RequestTimeout, withDeadline } from "./deadline";
afterEach(() => vi.useRealTimers());
it("times out even when a transport or response body never settles", async () => {
  vi.useFakeTimers();
  let signal!: AbortSignal;
  const request = withDeadline((s) => {
    signal = s;
    return new Promise(() => undefined);
  });
  const assertion = expect(request).rejects.toBeInstanceOf(RequestTimeout);
  await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS);
  await assertion;
  expect(signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it("propagates caller cancellation without waiting for the deadline", async () => {
  const caller = new AbortController();
  const request = withDeadline(
    () => new Promise(() => undefined),
    caller.signal,
  );
  caller.abort(new Error("Query cancelled"));
  await expect(request).rejects.toThrow("Query cancelled");
});
it("clears the deadline after success", async () => {
  vi.useFakeTimers();
  await expect(withDeadline(async () => "ok")).resolves.toBe("ok");
  expect(vi.getTimerCount()).toBe(0);
});
