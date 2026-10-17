import { expect, it } from "vitest";
import { formatDate, formatMoney } from "./money";

it("formats decimal strings without losing precision", () => {
  expect(formatMoney({ amount: "9007199254740993.01", currency: "CNY" })).toBe(
    "¥9,007,199,254,740,993.01",
  );
  expect(formatMoney({ amount: "-0.01", currency: "USD" }, true)).toBe(
    "−$0.01",
  );
  expect(formatMoney({ amount: "12000.00", currency: "CNY" }, true)).toBe(
    "+¥12,000.00",
  );
});
it("uses the documented timezone independent of browser locale", () => {
  expect(formatDate("2026-09-26T18:30:00Z", true)).toContain("27 Sept 2026");
});
