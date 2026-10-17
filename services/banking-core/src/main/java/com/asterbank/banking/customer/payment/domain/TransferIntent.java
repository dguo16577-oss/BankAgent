package com.asterbank.banking.customer.payment.domain;

import java.time.Instant;

public record TransferIntent(IntentTerms terms, String intentHash, Status status) {
  public enum Status {
    PREPARED,
    EXECUTED,
    EXPIRED,
    CANCELLED
  }

  public Status statusAt(Instant now) {
    return status == Status.PREPARED && !now.isBefore(terms.expiresAt().toInstant())
        ? Status.EXPIRED
        : status;
  }

  public TransferIntent executed() {
    if (status != Status.PREPARED) throw new IllegalStateException("Intent is not prepared");
    return new TransferIntent(terms, intentHash, Status.EXECUTED);
  }

  public TransferIntent cancelled() {
    if (status != Status.PREPARED) throw new IllegalStateException("Intent is not prepared");
    return new TransferIntent(terms, intentHash, Status.CANCELLED);
  }
}
