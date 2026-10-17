package com.asterbank.banking.customer.payment.domain;

import com.asterbank.banking.shared.domain.CustomerId;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Objects;

/** Session-bound review of one exact split action; only the application may commit it. */
public record SplitActionIntent(
    String id,
    CustomerId customerId,
    String sessionId,
    Type actionType,
    String splitId,
    int expectedVersion,
    SplitBill reviewedBill,
    String intentHash,
    OffsetDateTime createdAt,
    OffsetDateTime expiresAt,
    Status status,
    OffsetDateTime terminalAt) {
  public enum Type {
    CREATE,
    CANCEL
  }

  public enum Status {
    PREPARED,
    CANCELLED,
    EXPIRED,
    EXECUTED
  }

  public SplitActionIntent {
    if (id == null || id.isBlank() || sessionId == null || sessionId.isBlank())
      throw new IllegalArgumentException("Split intent identity required");
    Objects.requireNonNull(customerId);
    Objects.requireNonNull(actionType);
    Objects.requireNonNull(reviewedBill);
    Objects.requireNonNull(createdAt);
    Objects.requireNonNull(expiresAt);
    Objects.requireNonNull(status);
    if (!customerId.equals(reviewedBill.ownerCustomerId())
        || !reviewedBill.id().equals(splitId)
        || !expiresAt.toInstant().isAfter(createdAt.toInstant())
        || actionType == Type.CREATE && expectedVersion != -1
        || actionType == Type.CANCEL
            && (expectedVersion < 0 || reviewedBill.version() != expectedVersion))
      throw new IllegalArgumentException("Split intent binding mismatch");
    if (status == Status.PREPARED && terminalAt != null
        || status != Status.PREPARED && terminalAt == null)
      throw new IllegalArgumentException("Split intent terminal state mismatch");
    if (terminalAt != null
        && (terminalAt.toInstant().isBefore(createdAt.toInstant())
            || !terminalAt.toInstant().isBefore(expiresAt.toInstant())))
      throw new IllegalArgumentException("Split intent terminal time invalid");
    if (!hash(id, sessionId, actionType, reviewedBill, expectedVersion, createdAt, expiresAt)
        .equals(intentHash)) throw new IllegalArgumentException("Split intent hash mismatch");
  }

  public static SplitActionIntent prepare(
      String id, String session, Type type, SplitBill bill, OffsetDateTime at) {
    Objects.requireNonNull(bill);
    Objects.requireNonNull(type);
    Objects.requireNonNull(at);
    if (bill.status() != SplitBill.Status.ACTIVE
        || bill.createdAt().toInstant().isAfter(at.toInstant())
        || !bill.expiresAt().toInstant().isAfter(at.toInstant())
        || type == Type.CREATE && bill.version() != 0)
      throw new IllegalArgumentException("Split cannot be prepared");
    int expectedVersion = type == Type.CREATE ? -1 : bill.version();
    var expiry = at.plusMinutes(15);
    return new SplitActionIntent(
        id,
        bill.ownerCustomerId(),
        session,
        type,
        bill.id(),
        expectedVersion,
        bill,
        hash(id, session, type, bill, expectedVersion, at, expiry),
        at,
        expiry,
        Status.PREPARED,
        null);
  }

  public Status statusAt(OffsetDateTime at) {
    Objects.requireNonNull(at);
    if (status != Status.PREPARED) return status;
    return at.toInstant().isBefore(expiresAt.toInstant()) ? Status.PREPARED : Status.EXPIRED;
  }

  public SplitActionIntent transition(Status next, OffsetDateTime at) {
    if (next != Status.CANCELLED && next != Status.EXECUTED)
      throw new IllegalArgumentException("Invalid split intent transition");
    if (statusAt(at) != Status.PREPARED)
      throw new IllegalStateException("Split intent unavailable");
    return new SplitActionIntent(
        id,
        customerId,
        sessionId,
        actionType,
        splitId,
        expectedVersion,
        reviewedBill,
        intentHash,
        createdAt,
        expiresAt,
        next,
        at);
  }

  private static String hash(
      String id,
      String session,
      Type type,
      SplitBill bill,
      int expectedVersion,
      OffsetDateTime at,
      OffsetDateTime expiry) {
    var terms = new ArrayList<String>();
    terms.add("SPLIT_ACTION_V1");
    terms.add(id);
    terms.add(session);
    terms.add(type.name());
    terms.add(bill.id());
    terms.add(bill.ownerCustomerId().value());
    terms.add(bill.receivingAccountId().value());
    terms.add(bill.status().name());
    terms.add(Integer.toString(bill.version()));
    terms.add(Integer.toString(expectedVersion));
    terms.add(bill.total().decimal());
    terms.add(bill.total().currency().getCurrencyCode());
    terms.add(bill.payerShare().decimal());
    terms.add(bill.note());
    terms.add(bill.createdAt().toInstant().toString());
    terms.add(bill.expiresAt().toInstant().toString());
    for (var participant : bill.participants()) {
      terms.add(participant.id());
      terms.add(participant.recipientId().value());
      terms.add(participant.targetCustomerId().value());
      terms.add(participant.targetAccountId().value());
      terms.add(participant.amountDue().decimal());
      terms.add(participant.status().name());
    }
    terms.add(at.toInstant().toString());
    terms.add(expiry.toInstant().toString());
    return RecipientAction.digest(terms.toArray(String[]::new));
  }
}
