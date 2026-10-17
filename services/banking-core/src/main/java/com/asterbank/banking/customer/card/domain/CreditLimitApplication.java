package com.asterbank.banking.customer.card.domain;

import com.asterbank.banking.shared.domain.CustomerId;
import java.math.BigDecimal;
import java.time.Instant;

public record CreditLimitApplication(
    String id,
    CustomerId customer,
    String cardId,
    String intentId,
    BigDecimal currentLimit,
    BigDecimal requestedLimit,
    Status status,
    Instant submittedAt,
    String idempotencyKey) {
  public enum Status {
    SUBMITTED,
    UNDER_REVIEW,
    APPROVED,
    REJECTED
  }
}
