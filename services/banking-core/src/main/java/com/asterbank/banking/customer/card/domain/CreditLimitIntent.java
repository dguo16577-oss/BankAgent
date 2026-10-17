package com.asterbank.banking.customer.card.domain;

import com.asterbank.banking.shared.domain.CanonicalHash;
import com.asterbank.banking.shared.domain.CustomerId;
import java.math.BigDecimal;
import java.time.Instant;

public record CreditLimitIntent(
    String id,
    CustomerId customer,
    String sessionId,
    String cardId,
    BigDecimal currentLimit,
    BigDecimal requestedLimit,
    String intentHash,
    Status status,
    Instant createdAt,
    Instant expiresAt) {
  public enum Status {
    PREPARED,
    SUBMITTED,
    CANCELLED,
    EXPIRED
  }

  public static String hash(
      String id,
      CustomerId owner,
      String session,
      String cardId,
      BigDecimal current,
      BigDecimal requested,
      Instant created,
      Instant expires) {
    var canonical = new CanonicalHash();
    for (var part :
        new String[] {
          "CREDIT_LIMIT_INTENT_V1",
          id,
          owner.value(),
          session,
          cardId,
          current.setScale(2).toPlainString(),
          requested.setScale(2).toPlainString(),
          created.toString(),
          expires.toString()
        }) canonical.add(part);
    return canonical.digest();
  }
}
