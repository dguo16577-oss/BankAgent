package com.asterbank.banking.customer.account.application;

import com.asterbank.banking.customer.account.domain.Account;
import java.time.OffsetDateTime;
import java.util.List;

public record AccountSnapshot(OffsetDateTime asOf, List<Account> accounts) {
  public AccountSnapshot {
    accounts = List.copyOf(accounts);
  }

  public com.asterbank.banking.shared.domain.Money totalBalance() {
    return accounts.stream()
        .map(Account::baseValue)
        .reduce(
            com.asterbank.banking.shared.domain.Money.of("0.00", "CNY"),
            com.asterbank.banking.shared.domain.Money::add);
  }
}
