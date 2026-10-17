package com.asterbank.banking.customer.card.domain;

import java.time.Instant;

public record CardActionIntent(CardIntentTerms terms, String intentHash, Status status) {
  public enum Status {
    PREPARED,
    EXECUTED,
    CANCELLED,
    EXPIRED
  }

  public Status statusAt(Instant at) {
    return status == Status.PREPARED && !at.isBefore(terms.expiresAt().toInstant())
        ? Status.EXPIRED
        : status;
  }

  public CardActionIntent executed() {
    if (status != Status.PREPARED) throw new IllegalStateException("Intent is terminal");
    return new CardActionIntent(terms, intentHash, Status.EXECUTED);
  }

  public CardActionIntent cancelled() {
    if (status != Status.PREPARED) throw new IllegalStateException("Intent is terminal");
    return new CardActionIntent(terms, intentHash, Status.CANCELLED);
  }
}
