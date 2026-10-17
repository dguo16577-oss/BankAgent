package com.asterbank.banking.shared.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Currency;
import java.util.Objects;

public record Money(BigDecimal amount, Currency currency) {
  public Money {
    Objects.requireNonNull(currency);
    amount =
        Objects.requireNonNull(amount)
            .setScale(currency.getDefaultFractionDigits(), RoundingMode.UNNECESSARY);
  }

  public static Money of(String amount, String currency) {
    return new Money(new BigDecimal(amount), Currency.getInstance(currency));
  }

  public Money subtract(Money other) {
    requireCurrency(other);
    return new Money(amount.subtract(other.amount), currency);
  }

  public Money add(Money other) {
    requireCurrency(other);
    return new Money(amount.add(other.amount), currency);
  }

  private void requireCurrency(Money other) {
    if (!currency.equals(other.currency)) throw new IllegalArgumentException("Currency mismatch");
  }

  public String decimal() {
    return amount.toPlainString();
  }
}
