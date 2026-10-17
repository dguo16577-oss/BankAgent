package com.asterbank.banking.customer.recurring.domain;

import java.time.*;

public record RecurringIntent(Terms terms, String intentHash, Status status) {
  public enum Status {
    PREPARED,
    EXECUTED,
    CANCELLED,
    EXPIRED
  }

  public record Terms(
      String id,
      RecurringPayment payment,
      RecurringPayment.State after,
      String effectDescription,
      OffsetDateTime createdAt,
      OffsetDateTime expiresAt) {}

  public Status statusAt(Instant now) {
    return status == Status.PREPARED && !now.isBefore(terms.expiresAt().toInstant())
        ? Status.EXPIRED
        : status;
  }

  public RecurringIntent executed() {
    return new RecurringIntent(terms, intentHash, Status.EXECUTED);
  }

  public RecurringIntent cancelled() {
    return new RecurringIntent(terms, intentHash, Status.CANCELLED);
  }
}
