import { describe, expect, it } from "vitest";
import {
  categoryLabel,
  displayPeriod,
  presentationTitle,
} from "./financial-display";

describe("financial display labels", () => {
  it("displays half-open natural months without a misleading next-month date", () => {
    expect(
      displayPeriod(
        "2026-09-01T00:00:00+08:00",
        "2026-10-01T00:00:00+08:00",
        true,
      ),
    ).toBe("2026/09/01 – 2026/09/30 · UTC+08:00");
    expect(
      displayPeriod("2026-08-31T16:00:00Z", "2026-09-30T16:00:00Z", false),
    ).toBe("2026/09/01 – 2026/09/30 · UTC+08:00");
  });
  it("keeps precise exclusive endpoints and fractions", () => {
    const result = displayPeriod(
      "2026-09-01T00:00:00+08:00",
      "2026-09-30T23:59:59.500+08:00",
      true,
    );
    expect(result).toContain("2026/09/30 23:59:59.500");
    expect(result).toContain("不含结束时刻");
    expect(
      displayPeriod(
        "2026-09-01T00:00:00+08:00",
        "2026-10-01T00:00:00.000001+08:00",
        true,
      ),
    ).toContain("2026/10/01 00:00:00.000001");
  });
  it("does not reinterpret date-only or unrecognized evidence as complete months", () => {
    expect(displayPeriod("2026-01-01", "2026-10-15", true)).toBe(
      "2026-01-01 – 2026-10-15",
    );
    expect(displayPeriod("unknown", "unavailable", false)).toBe(
      "unknown – unavailable",
    );
  });
  it("translates only known category codes and titles, preserving unknown labels", () => {
    expect(categoryLabel("SUBSCRIPTIONS", true)).toBe("订阅");
    expect(categoryLabel("SHOPPING", false)).toBe("Shopping");
    expect(categoryLabel("https://evil.example", true)).toBe(
      "https://evil.example",
    );
    expect(presentationTitle("constructor", true)).toBe("constructor");
    expect(presentationTitle("__proto__", true)).toBe("__proto__");
    expect(
      presentationTitle("Spending by category · YTD / Current period", true),
    ).toBe("分类消费 · 年初至今 / 本期");
  });
});
