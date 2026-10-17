package com.asterbank.banking.customer.wealth.domain;

import com.asterbank.banking.customer.account.domain.Account;
import com.asterbank.banking.shared.domain.Money;
import java.time.*;

/**
 * Immutable owner-scoped redemption review terms. Amount is demo cost-addition value, not units.
 */
public record RedemptionIntent(Terms terms, String intentHash, Status status) {
  public enum Status {
    PREPARED,
    EXECUTED,
    EXPIRED,
    CANCELLED
  }

  public record Terms(
      String id,
      InvestmentProduct product,
      Position holding,
      Account destinationAccount,
      RiskProfile riskProfile,
      Money amount,
      Money fees,
      Money estimatedProceeds,
      OffsetDateTime createdAt,
      OffsetDateTime expiresAt) {}

  public Status statusAt(Instant now) {
    return status == Status.PREPARED && !now.isBefore(terms.expiresAt().toInstant())
        ? Status.EXPIRED
        : status;
  }

  public RedemptionIntent executed() {
    return new RedemptionIntent(terms, intentHash, Status.EXECUTED);
  }

  public RedemptionIntent cancelled() {
    return new RedemptionIntent(terms, intentHash, Status.CANCELLED);
  }
}
