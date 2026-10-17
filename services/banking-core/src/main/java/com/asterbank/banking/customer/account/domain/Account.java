package com.asterbank.banking.customer.account.domain;

import com.asterbank.banking.shared.domain.*;
import java.time.OffsetDateTime;
import java.util.Objects;

public record Account(
    AccountId id,
    CustomerId customerId,
    String displayName,
    AccountType type,
    AccountStatus status,
    Money balance,
    Money pendingAmount,
    String maskedAccountNumber,
    OffsetDateTime openedAt,
    ExchangeEquivalent equivalent) {
  public Account {
    Objects.requireNonNull(id);
    Objects.requireNonNull(customerId);
    Objects.requireNonNull(type);
    Objects.requireNonNull(status);
    if (pendingAmount.amount().signum() < 0)
      throw new IllegalArgumentException("Negative pending amount");
    balance.subtract(pendingAmount);
    if (!maskedAccountNumber.matches("•••• [0-9]{4}"))
      throw new IllegalArgumentException("Account identifier must be masked");
  }

  public Money availableBalance() {
    return balance.subtract(pendingAmount);
  }

  public Account debit(Money debit) {
    if (status != AccountStatus.ACTIVE) throw new IllegalStateException("Account is not active");
    if (type == AccountType.TIME_DEPOSIT)
      throw new IllegalStateException("Time deposit principal is locked");
    if (debit.amount().signum() <= 0) throw new IllegalArgumentException("Debit must be positive");
    var remaining = availableBalance().subtract(debit);
    if (remaining.amount().signum() < 0)
      throw new IllegalArgumentException("Insufficient available funds");
    if (equivalent != null) throw new IllegalArgumentException("FX debit is not implemented");
    return new Account(
        id,
        customerId,
        displayName,
        type,
        status,
        balance.subtract(debit),
        pendingAmount,
        maskedAccountNumber,
        openedAt,
        equivalent);
  }

  public Account credit(Money credit) {
    if (status != AccountStatus.ACTIVE) throw new IllegalStateException("Account is not active");
    if (credit.amount().signum() <= 0)
      throw new IllegalArgumentException("Credit must be positive");
    if (equivalent != null) throw new IllegalArgumentException("FX credit is not implemented");
    return new Account(
        id,
        customerId,
        displayName,
        type,
        status,
        balance.add(credit),
        pendingAmount,
        maskedAccountNumber,
        openedAt,
        equivalent);
  }

  public Money baseValue() {
    return equivalent == null ? balance : equivalent.value();
  }
}
