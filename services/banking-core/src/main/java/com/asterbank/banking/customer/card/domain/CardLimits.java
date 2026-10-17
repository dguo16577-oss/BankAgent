package com.asterbank.banking.customer.card.domain;

import java.math.BigDecimal;
import java.util.Objects;

/** Customer-configured CNY limits and distinct bank policy ceilings. */
public record CardLimits(
    BigDecimal perTransaction,
    BigDecimal daily,
    BigDecimal bankMaxPerTransaction,
    BigDecimal bankMaxDaily) {
  public static CardLimits defaults() {
    return new CardLimits(
        new BigDecimal("2000.00"),
        new BigDecimal("5000.00"),
        new BigDecimal("10000.00"),
        new BigDecimal("20000.00"));
  }

  public CardLimits {
    for (var value :
        new BigDecimal[] {perTransaction, daily, bankMaxPerTransaction, bankMaxDaily}) {
      Objects.requireNonNull(value);
      if (value.scale() > 2 || value.signum() <= 0)
        throw new CardRuleViolation(CardRuleViolation.Code.INVALID_REQUEST);
    }
    if (perTransaction.compareTo(daily) > 0
        || perTransaction.compareTo(bankMaxPerTransaction) > 0
        || daily.compareTo(bankMaxDaily) > 0)
      throw new CardRuleViolation(CardRuleViolation.Code.CARD_LIMIT_EXCEEDED);
  }

  public CardLimits withCustomerLimits(BigDecimal perTransaction, BigDecimal daily) {
    return new CardLimits(perTransaction, daily, bankMaxPerTransaction, bankMaxDaily);
  }
}
