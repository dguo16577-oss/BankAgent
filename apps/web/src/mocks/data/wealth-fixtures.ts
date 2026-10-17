import type { components } from "@/generated/customer-api";
import { demoProfile } from "./demo-profile";
import { minor, decimal, percentage } from "../bank/amount";
type S = components["schemas"];
const cny = (amount: string): S["Money"] => ({ amount, currency: "CNY" });
export function initialProducts(): S["InvestmentProductDetail"][] {
  const rows: [
    string,
    string,
    S["InvestmentProductType"],
    S["RiskLevel"],
    string,
    string,
  ][] = [
    [
      "product_cash",
      "Aster Cash Reserve",
      "MONEY_MARKET",
      "R1",
      "100.00",
      "1.80",
    ],
    ["product_bond", "Aster Stable Bond", "BOND_FUND", "R2", "1000.00", "2.60"],
    [
      "product_balanced",
      "Aster Balanced Growth",
      "BALANCED_FUND",
      "R3",
      "1000.00",
      "3.40",
    ],
    [
      "product_equity",
      "Aster Equity Select",
      "EQUITY_FUND",
      "R4",
      "2000.00",
      "4.20",
    ],
  ];
  return rows.map(
    ([id, displayName, type, riskLevel, minimum, indicativeYield]) => ({
      id,
      displayName,
      type,
      riskLevel,
      currency: "CNY",
      minimumInvestment: cny(minimum),
      fees: cny("0.00"),
      status: "AVAILABLE",
      dataSource: "SIMULATED",
      indicativeYield,
      performanceSummary:
        "Illustrative annual yield for this demo only. It is not a forecast or promised return.",
      liquidity:
        "Simulated purchase completes immediately. Redemption is not available in this demo.",
      description: `A fictional ${type.toLowerCase().replaceAll("_", " ")} used to demonstrate suitability and an investment order.`,
      disclaimer:
        "SIMULATED PRODUCT · No real investment is placed. Capital and returns are not guaranteed. The displayed figures are demo values, not financial advice.",
      version: 0,
    }),
  );
}
export function summarizeProduct(
  product: S["InvestmentProductDetail"],
): S["InvestmentProductSummary"] {
  const {
    id,
    displayName,
    type,
    riskLevel,
    currency,
    minimumInvestment,
    status,
    dataSource,
  } = product;
  return structuredClone({
    id,
    displayName,
    type,
    riskLevel,
    currency,
    minimumInvestment,
    status,
    dataSource,
  });
}
export function initialRiskProfile(): S["UserRiskProfile"] {
  return {
    userId: demoProfile.user.id,
    displayName: demoProfile.user.displayName,
    riskLevel: "R2",
    version: 0,
    assessedAt: "2026-09-01T09:00:00+08:00",
    expiresAt: "2027-09-01T09:00:00+08:00",
    dataSource: "SIMULATED",
  };
}
export function initialPortfolio(): S["PortfolioSummary"] {
  const positions: S["PortfolioPosition"][] = demoProfile.holdings.map(
    (holding) => {
      const investedAmount =
        holding.id === "holding_bond" ? cny("5100.00") : holding.value;
      return {
        id: holding.id,
        ...(holding.id === "holding_market"
          ? { productId: "product_cash" }
          : holding.id === "holding_bond"
            ? { productId: "product_bond" }
            : {}),
        displayName: holding.name,
        type: holding.id === "holding_bond" ? "BOND_FUND" : "MONEY_MARKET",
        currentValue: structuredClone(holding.value),
        investedAmount: structuredClone(investedAmount),
        gainLoss: cny(
          decimal(minor(holding.value.amount) - minor(investedAmount.amount)),
        ),
      };
    },
  );
  const total = positions.reduce(
    (sum, p) => sum + minor(p.currentValue.amount),
    BigInt(0),
  );
  const change = total - minor(demoProfile.previousPortfolioTotal.amount);
  return recalculatePortfolio({
    currency: "CNY",
    positions,
    totalValue: cny(decimal(total)),
    investedAmount: cny("18100.00"),
    gainLoss: cny(decimal(change)),
    monthlyChange: cny(decimal(change)),
    monthlyChangePercent: percentage(
      change,
      minor(demoProfile.previousPortfolioTotal.amount),
    ),
    monthlyNetContributions: cny("0.00"),
    performanceSummary:
      "Fixed demo month-to-date valuation change; new purchases are capital contributions, not performance gains. New investments add cost value, without live NAV or market pricing.",
    valuationBasis: "SIMULATED_COST_ADDITION",
    dataSource: "SIMULATED",
    asOf: demoProfile.asOf,
    version: 0,
  });
}
export function recalculatePortfolio(
  portfolio: S["PortfolioSummary"],
): S["PortfolioSummary"] {
  const copy = structuredClone(portfolio);
  let total = BigInt(0),
    invested = BigInt(0);
  for (const position of copy.positions) {
    total += minor(position.currentValue.amount);
    invested += minor(position.investedAmount.amount);
    position.gainLoss = cny(
      decimal(
        minor(position.currentValue.amount) -
          minor(position.investedAmount.amount),
      ),
    );
  }
  copy.totalValue = cny(decimal(total));
  copy.investedAmount = cny(decimal(invested));
  copy.gainLoss = cny(decimal(total - invested));
  return copy;
}
export function wealthOverview(
  portfolio: S["PortfolioSummary"],
): S["WealthSummary"] {
  return {
    total: structuredClone(portfolio.totalValue),
    monthlyChange: structuredClone(portfolio.monthlyChange),
    monthlyChangePercent: portfolio.monthlyChangePercent,
    holdings: portfolio.positions.map((p) => ({
      id: p.id,
      name: p.displayName,
      value: structuredClone(p.currentValue),
    })),
  };
}
