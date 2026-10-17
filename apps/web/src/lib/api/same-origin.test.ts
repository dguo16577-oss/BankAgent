import { expect, it } from "vitest";
import { parseApiRuntime } from "./runtime";
it("uses an explicit root sentinel without binding the image to a host", () => {
  expect(parseApiRuntime("backend", "/")).toEqual({
    mode: "backend",
    baseUrl: "",
  });
  expect(() => parseApiRuntime("backend")).toThrow();
  expect(() => parseApiRuntime("backend", "//untrusted.example")).toThrow();
});
