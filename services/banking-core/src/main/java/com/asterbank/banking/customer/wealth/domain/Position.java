package com.asterbank.banking.customer.wealth.domain;

import com.asterbank.banking.shared.domain.*;
import java.math.RoundingMode;
import java.time.OffsetDateTime;

public record Position(
    String id,
    CustomerId customerId,
    String productId,
    String displayName,
    InvestmentProduct.Type type,
    Money currentValue,
    Money investedAmount,
    Money monthlyChange,
    Money monthlyNetContributions,
    int version,
    OffsetDateTime asOf) {
  public Money gainLoss() {
    return currentValue.subtract(investedAmount);
  }

  public Position purchase(Money principal, OffsetDateTime at) {
    return new Position(
        id,
        customerId,
        productId,
        displayName,
        type,
        currentValue.add(principal),
        investedAmount.add(principal),
        monthlyChange,
        monthlyNetContributions.add(principal),
        version + 1,
        at);
  }

  /** Demo redemption uses the displayed cost-addition value; no NAV or market quote is implied. */
  public Position redeem(Money value, OffsetDateTime at) {
    if (value.amount().signum() <= 0 || value.amount().compareTo(currentValue.amount()) > 0)
      throw new WealthFailure(WealthFailure.Code.REDEMPTION_EXCEEDS_HOLDING);
    var costRemoved =
        value.amount().compareTo(currentValue.amount()) == 0
            ? investedAmount.amount()
            : investedAmount
                .amount()
                .multiply(value.amount())
                .divide(currentValue.amount(), 2, RoundingMode.HALF_UP);
    return new Position(
        id,
        customerId,
        productId,
        displayName,
        type,
        currentValue.subtract(value),
        investedAmount.subtract(new Money(costRemoved, value.currency())),
        monthlyChange,
        monthlyNetContributions.subtract(value),
        version + 1,
        at);
  }
}
