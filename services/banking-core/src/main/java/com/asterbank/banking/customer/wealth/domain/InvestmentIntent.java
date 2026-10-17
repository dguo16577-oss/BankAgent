package com.asterbank.banking.customer.wealth.domain;

import com.asterbank.banking.customer.account.domain.Account;
import com.asterbank.banking.shared.domain.Money;
import java.time.*;

public record InvestmentIntent(Terms terms, String intentHash, Status status) {
  public enum Status {
    PREPARED,
    EXECUTED,
    EXPIRED,
    CANCELLED
  }

  public record Terms(
      String id,
      InvestmentProduct product,
      Account sourceAccount,
      Suitability suitability,
      Money amount,
      Money fees,
      Money totalDebit,
      Money projectedAvailableBalance,
      OffsetDateTime createdAt,
      OffsetDateTime expiresAt) {}

  public Status statusAt(Instant now) {
    return status == Status.PREPARED && !now.isBefore(terms.expiresAt().toInstant())
        ? Status.EXPIRED
        : status;
  }

  public InvestmentIntent executed() {
    return new InvestmentIntent(terms, intentHash, Status.EXECUTED);
  }

  public InvestmentIntent cancelled() {
    return new InvestmentIntent(terms, intentHash, Status.CANCELLED);
  }
}
