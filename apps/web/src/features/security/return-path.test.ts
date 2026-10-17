import { expect, it } from "vitest";
import { safeReturnPath } from "./return-path";
it.each([
  "/products/personal-loan?source=loans#apply",
  "/cards",
  "/app/accounts",
  "/support?search=card",
])("preserves the originating page %s", (path) => {
  expect(safeReturnPath(path)).toBe(path);
});
it.each([
  "https://evil.example",
  "//evil.example",
  "/\\evil.example",
  "/login?next=/login",
  "/api/customer/session",
  "javascript:alert(1)",
])("rejects unsafe or looping destinations %s", (path) => {
  expect(safeReturnPath(path)).toBe("/");
});
