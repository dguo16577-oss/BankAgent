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
  it.each([
    [
      "2026-09-30T23:59:59.000001+08:00",
      "2026-09-30T23:59:59.000002+08:00",
      "2026/09/30 23:59:59.000001 – 2026/09/30 23:59:59.000002 （不含结束时刻） · UTC+08:00",
    ],
    [
      "2026-09-30T15:59:59.000001Z",
      "2026-09-30T23:59:59.000002+08:00",
      "2026/09/30 23:59:59.000001 – 2026/09/30 23:59:59.000002 （不含结束时刻） · UTC+08:00",
    ],
    [
      "2026-09-30T10:59:59.000001-05:00",
      "2026-09-30T21:29:59.000002+05:30",
      "2026/09/30 23:59:59.000001 – 2026/09/30 23:59:59.000002 （不含结束时刻） · UTC+08:00",
    ],
    [
      "2026-09-30T23:59:59.1+08:00",
      "2026-09-30T23:59:59.100001+08:00",
      "2026/09/30 23:59:59.1 – 2026/09/30 23:59:59.100001 （不含结束时刻） · UTC+08:00",
    ],
  ])(
    "preserves sub-millisecond ordering and exclusive end across offsets: %s",
    (from, to, expected) => {
      expect(displayPeriod(from, to, true)).toBe(expected);
      expect(displayPeriod(from, to, false)).toContain("(end exclusive)");
    },
  );
  it.each([
    ["2026-09-30T23:59:59.000002+08:00", "2026-09-30T23:59:59.000001+08:00"],
    ["2026-09-30T23:59:59.1+08:00", "2026-09-30T15:59:59.1000Z"],
    ["2026-02-30T00:00:00+08:00", "2026-03-02T00:00:00+08:00"],
    ["2025-02-29T00:00:00+08:00", "2025-03-02T00:00:00+08:00"],
    ["2026-09-30T24:00:00+08:00", "2026-10-02T00:00:00+08:00"],
    ["2026-09-30T23:59:59+08:60", "2026-10-01T00:00:00+08:00"],
  ])(
    "leaves invalid, equal or reversed ranges uninterpreted: %s",
    (from, to) => {
      expect(displayPeriod(from, to, true)).toBe(`${from} – ${to}`);
    },
  );
  it("still displays valid leap-year whole days as included dates", () => {
    expect(
      displayPeriod(
        "2024-02-29T00:00:00+08:00",
        "2024-03-01T00:00:00+08:00",
        true,
      ),
    ).toBe("2024/02/29 – 2024/02/29 · UTC+08:00");
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
