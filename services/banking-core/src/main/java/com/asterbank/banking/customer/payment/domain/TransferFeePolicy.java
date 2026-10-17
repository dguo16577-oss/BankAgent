package com.asterbank.banking.customer.payment.domain;

import com.asterbank.banking.shared.domain.Money;

public final class TransferFeePolicy {
  public Money fee(Money amount) {
    return Money.of("0.00", amount.currency().getCurrencyCode());
  }
}
