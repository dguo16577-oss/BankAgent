package com.asterbank.banking.customer.account.domain;

import com.asterbank.banking.shared.domain.Money;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Currency;

public record ExchangeEquivalent(
    Money value, Currency sourceCurrency, BigDecimal exchangeRate, OffsetDateTime conversionAsOf) {
  public ExchangeEquivalent {
    if (exchangeRate.signum() <= 0)
      throw new IllegalArgumentException("Exchange rate must be positive");
  }
}
