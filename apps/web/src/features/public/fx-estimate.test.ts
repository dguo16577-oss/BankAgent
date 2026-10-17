import { expect, it } from "vitest";
import { estimateFx } from "./fx-estimate";

it("converts in both directions using decimal-safe reference rates", () => {
  expect(estimateFx("100.00", "7.1000", "1.0000")).toBe("710.00");
  expect(estimateFx("100.00", "1.0000", "0.0480")).toBe("2083.33");
  expect(estimateFx("100.00", "7.1000", "0.0480")).toBe("14791.67");
});

it("rounds to two decimals and rejects invalid input", () => {
  expect(estimateFx("0.01", "1.0000", "3.0000")).toBe("0.00");
  expect(estimateFx("0.02", "1.0000", "3.0000")).toBe("0.01");
  expect(estimateFx("1e6", "7.1000", "1.0000")).toBeNull();
  expect(estimateFx("-1", "7.1000", "1.0000")).toBeNull();
});
