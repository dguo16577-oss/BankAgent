package com.asterbank.banking.customer.payment.domain;

import com.asterbank.banking.shared.domain.CustomerId;
import java.time.OffsetDateTime;

public record ScheduleAction(
    String id,
    CustomerId customerId,
    String sessionId,
    Type actionType,
    String scheduleId,
    int expectedVersion,
    ScheduledPayment proposed,
    String intentHash,
    OffsetDateTime createdAt,
    OffsetDateTime expiresAt) {
  public enum Type {
    CREATE,
    AMEND,
    CANCEL
  }

  public static ScheduleAction prepare(
      String id,
      String session,
      Type type,
      int previousVersion,
      ScheduledPayment proposed,
      OffsetDateTime now) {
    var hash =
        RecipientAction.digest(
            "SCHEDULE_ACTION_V1",
            id,
            session,
            type.name(),
            proposed.customerId().value(),
            proposed.id(),
            String.valueOf(previousVersion),
            proposed.mandateHash(),
            now.toInstant().toString());
    return new ScheduleAction(
        id,
        proposed.customerId(),
        session,
        type,
        proposed.id(),
        previousVersion,
        proposed,
        hash,
        now,
        now.plusMinutes(15));
  }
}
