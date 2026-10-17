package com.asterbank.banking.customer.card.domain;

import com.asterbank.banking.shared.domain.CustomerId;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** A simulated card authorization decision; it does not settle or reserve funds. */
public record CardAuthorization(
    String id,
    CustomerId customer,
    String cardId,
    BigDecimal amount,
    Channel channel,
    boolean international,
    Status status,
    Reason reason,
    OffsetDateTime authorizedAt,
    String requestKey,
    String requestHash) {
  public enum Channel {
    ONLINE,
    IN_PERSON,
    ATM,
    CONTACTLESS
  }

  public enum Status {
    APPROVED,
    DECLINED
  }

  public enum Reason {
    APPROVED,
    CARD_INACTIVE,
    ONLINE_DISABLED,
    INTERNATIONAL_DISABLED,
    ATM_DISABLED,
    CONTACTLESS_DISABLED,
    PER_TRANSACTION_LIMIT,
    DAILY_LIMIT,
    CREDIT_LIMIT
  }
}
