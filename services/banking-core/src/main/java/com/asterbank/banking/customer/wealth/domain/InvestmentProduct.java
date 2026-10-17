package com.asterbank.banking.customer.wealth.domain;

import com.asterbank.banking.shared.domain.Money;

public record InvestmentProduct(
    String id,
    String displayName,
    Type type,
    RiskLevel riskLevel,
    Money minimumInvestment,
    Status status,
    Money fees,
    String indicativeYield,
    String performanceSummary,
    String liquidity,
    String description,
    String disclaimer,
    int version) {
  public enum Type {
    MONEY_MARKET,
    BOND_FUND,
    BALANCED_FUND,
    EQUITY_FUND
  }

  public enum Status {
    AVAILABLE,
    UNAVAILABLE
  }

  public String currency() {
    return minimumInvestment.currency().getCurrencyCode();
  }
}
