package com.asterbank.banking.customer.account.adapter.persistence;

import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.shared.domain.*;
import java.util.Currency;

public final class AccountPersistenceMapper {
  private AccountPersistenceMapper() {}

  public static Account domain(AccountJpaEntity e) {
    return new Account(
        new AccountId(e.accountId),
        new CustomerId(e.customerId),
        e.displayName,
        AccountType.valueOf(e.accountType),
        AccountStatus.valueOf(e.status),
        new Money(e.balance, Currency.getInstance(e.currency)),
        new Money(e.pendingAmount, Currency.getInstance(e.currency)),
        e.maskedIdentifier,
        e.openedAt,
        e.equivalentAmount == null
            ? null
            : new ExchangeEquivalent(
                new Money(e.equivalentAmount, Currency.getInstance(e.equivalentCurrency)),
                Currency.getInstance(e.currency),
                e.exchangeRate,
                e.conversionAsOf));
  }

  public static AccountJpaEntity entity(Account a) {
    var e = new AccountJpaEntity();
    e.accountId = a.id().value();
    e.customerId = a.customerId().value();
    e.displayName = a.displayName();
    e.accountType = a.type().name();
    e.status = a.status().name();
    e.currency = a.balance().currency().getCurrencyCode();
    e.balance = a.balance().amount();
    e.pendingAmount = a.pendingAmount().amount();
    e.maskedIdentifier = a.maskedAccountNumber();
    e.openedAt = a.openedAt();
    if (a.equivalent() != null) {
      var x = a.equivalent();
      e.equivalentAmount = x.value().amount();
      e.equivalentCurrency = x.value().currency().getCurrencyCode();
      e.exchangeRate = x.exchangeRate();
      e.conversionAsOf = x.conversionAsOf();
    }
    return e;
  }
}
