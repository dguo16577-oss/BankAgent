package com.asterbank.banking.customer.payment.domain;

import com.asterbank.banking.shared.domain.*;
import java.time.OffsetDateTime;

/** A durable, explicitly confirmed instruction; it neither reserves nor moves money. */
public record ScheduledPayment(
    String id,
    CustomerId customerId,
    IntentTerms terms,
    OffsetDateTime dueAt,
    Status status,
    int version,
    String mandateHash,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt,
    String transferId,
    String transactionId,
    OffsetDateTime executedAt,
    String failureReason) {
  public enum Status {
    SCHEDULED,
    EXECUTED,
    CANCELLED,
    FAILED
  }

  public static String hash(String id, IntentTerms t, OffsetDateTime due, int version) {
    return RecipientAction.digest(
        "SCHEDULE_MANDATE_V1",
        id,
        t.customerId().value(),
        t.sourceAccount().id().value(),
        t.sourceAccount().maskedAccountNumber(),
        t.recipient().id().value(),
        t.recipient().destinationRef(),
        String.valueOf(t.recipient().version()),
        t.recipient().status().name(),
        t.amount().decimal(),
        t.amount().currency().getCurrencyCode(),
        t.fee().decimal(),
        t.totalDebit().decimal(),
        due.toInstant().toString(),
        String.valueOf(version),
        t.note(),
        t.policyVersion(),
        t.authorizationRequirement());
  }

  public ScheduledPayment finish(Status next, OffsetDateTime at, Transfer transfer, String reason) {
    if (status != Status.SCHEDULED || next == Status.SCHEDULED)
      throw new IllegalStateException("Terminal schedule cannot transition");
    return new ScheduledPayment(
        id,
        customerId,
        terms,
        dueAt,
        next,
        version + 1,
        mandateHash,
        createdAt,
        at,
        transfer == null ? null : transfer.id(),
        transfer == null ? null : transfer.transactionId().value(),
        transfer == null ? null : at,
        reason);
  }
}
