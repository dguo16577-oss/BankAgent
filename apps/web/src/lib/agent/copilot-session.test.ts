import { expect, it } from "vitest";
import { copilotThreadId } from "./copilot-session";

it("binds an opaque thread to the bank session cookie, independent of CSRF changes", () => {
  const first = copilotThreadId("SESSION=one; XSRF-TOKEN=old");
  expect(first).toMatch(/^[a-f0-9]{64}$/);
  expect(copilotThreadId("XSRF-TOKEN=new; SESSION=one")).toBe(first);
  expect(copilotThreadId("SESSION=two")).not.toBe(first);
  expect(() => copilotThreadId("XSRF-TOKEN=only")).toThrow();
});
