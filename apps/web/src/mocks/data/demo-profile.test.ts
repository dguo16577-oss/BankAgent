import { expect, it } from "vitest";
import {
  demoProfile,
  demoSession,
  demoTransactions,
  getDemoOverview,
} from "./demo-profile";

it("reconciles the shared profile, deposits, spending, investments and timeline", () => {
  const overview = getDemoOverview();
  expect(overview.user).toEqual(demoSession.user);
  expect(overview.accounts?.map((account) => account.balance.amount)).toEqual([
    "23842.31",
    "8200.00",
    "621.32",
  ]);
  expect(overview.totalBalance).toEqual({
    amount: "36453.68",
    currency: "CNY",
  });
  expect(overview.spending?.currentPeriod.amount.amount).toBe("4968.00");
  expect(overview.spending?.changePercent).toBe("3.50");
  expect(overview.spending?.trend).toHaveLength(6);
  expect(overview.spending?.trend.at(-1)).toEqual({
    periodStart: overview.spending?.currentPeriod.periodStart,
    amount: overview.spending?.currentPeriod.amount,
  });
  expect(overview.wealth?.total.amount).toBe("18320.00");
  expect(overview.wealth?.monthlyChange.amount).toBe("220.00");
  expect(overview.wealth?.monthlyChangePercent).toBe("1.22");
  expect(demoProfile.recurring.map((item) => item.amount.amount)).toEqual([
    "3000.00",
    "88.00",
    "65.00",
    "238.00",
    "145.00",
  ]);
  expect(
    demoTransactions.every(
      (item) => Date.parse(item.occurredAt) <= Date.parse(overview.asOf),
    ),
  ).toBe(true);
  expect(
    overview.upcomingPayments?.every(
      (item) => Date.parse(item.dueAt) > Date.parse(overview.asOf),
    ),
  ).toBe(true);
  const recent = overview.recentTransactions ?? [];
  expect(recent.map((item) => item.occurredAt)).toEqual(
    recent
      .map((item) => item.occurredAt)
      .sort()
      .reverse(),
  );
});
