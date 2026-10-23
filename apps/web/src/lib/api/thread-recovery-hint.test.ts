import { beforeEach, expect, it } from "vitest";
import { readRecoveryHint, writeRecoveryHint } from "./thread-recovery-hint";
beforeEach(() => sessionStorage.clear());
it("persists only the bounded recovery marker", () => {
  const hint = { taskId: "a".repeat(32), status: "PARTIAL", assistantCount: 2 };
  writeRecoveryHint("thread-1", hint);
  expect(readRecoveryHint("thread-1")).toEqual(hint);
});
it("rejects financial content and malformed fields instead of storing them", () => {
  for (const value of [
    { assistantCount: 1, amount: "1.00" },
    { assistantCount: 1, receipt: { id: "bank" } },
    { assistantCount: 1, message: "bank data" },
    { assistantCount: -1 },
    { assistantCount: 1, taskId: "arbitrary text" },
    { assistantCount: 1, status: "custom" },
  ])
    expect(() => writeRecoveryHint("thread-1", value)).toThrow();
  expect(sessionStorage.length).toBe(0);
});
it("discards invalid stored data without returning it to the conversation", () => {
  sessionStorage.setItem(
    "aster-agui-inflight-thread-1",
    '{"assistantCount":1,"balance":"100"}',
  );
  expect(readRecoveryHint("thread-1")).toBeUndefined();
  expect(sessionStorage.length).toBe(0);
});
