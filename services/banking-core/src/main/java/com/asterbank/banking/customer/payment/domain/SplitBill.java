package com.asterbank.banking.customer.payment.domain;

import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.shared.domain.CustomerId;
import com.asterbank.banking.shared.domain.Money;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;

/** Immutable, customer-owned collection request; no balance changes occur on creation. */
public record SplitBill(
    String id,
    CustomerId ownerCustomerId,
    AccountId receivingAccountId,
    Money total,
    Money payerShare,
    List<SplitParticipant> participants,
    String note,
    Status status,
    int version,
    OffsetDateTime createdAt,
    OffsetDateTime expiresAt,
    OffsetDateTime cancelledAt) {
  public enum Status {
    ACTIVE,
    CANCELLED,
    EXPIRED,
    SETTLED
  }

  public SplitBill {
    if (id == null || id.isBlank()) throw new IllegalArgumentException("Split ID required");
    Objects.requireNonNull(ownerCustomerId);
    Objects.requireNonNull(receivingAccountId);
    Objects.requireNonNull(total);
    Objects.requireNonNull(payerShare);
    Objects.requireNonNull(status);
    Objects.requireNonNull(createdAt);
    Objects.requireNonNull(expiresAt);
    participants = List.copyOf(Objects.requireNonNull(participants));
    note = note == null ? "" : note.strip();
    if (participants.isEmpty() || version < 0 || !expiresAt.isAfter(createdAt))
      throw new IllegalArgumentException("Invalid split lifecycle");
    if (total.amount().signum() <= 0
        || payerShare.amount().signum() < 0
        || !"CNY".equals(total.currency().getCurrencyCode())
        || !total.currency().equals(payerShare.currency()))
      throw new IllegalArgumentException("Invalid split amount");
    if (note != null && note.length() > 280)
      throw new IllegalArgumentException("Split note is too long");
    if ((status == Status.CANCELLED) != (cancelledAt != null)
        || cancelledAt != null
            && (cancelledAt.isBefore(createdAt) || !cancelledAt.isBefore(expiresAt))
        || status == Status.CANCELLED
            && participants.stream()
                .anyMatch(participant -> participant.status() == SplitParticipant.Status.PENDING))
      throw new IllegalArgumentException("Invalid cancellation state");
    var ids = new HashSet<String>();
    var recipients = new HashSet<RecipientId>();
    var customers = new HashSet<CustomerId>();
    var sum = payerShare;
    for (var participant : participants) {
      if (participant == null
          || !ids.add(participant.id())
          || !recipients.add(participant.recipientId())
          || !customers.add(participant.targetCustomerId())
          || participant.targetCustomerId().equals(ownerCustomerId)
          || !participant.amountDue().currency().equals(total.currency()))
        throw new IllegalArgumentException("Duplicate or invalid split participant");
      sum = sum.add(participant.amountDue());
    }
    if (!sum.equals(total)) throw new IllegalArgumentException("Split shares must equal total");
  }

  public SplitBill cancel(OffsetDateTime at) {
    Objects.requireNonNull(at);
    if (status != Status.ACTIVE || at.isBefore(createdAt) || !at.isBefore(expiresAt))
      throw new IllegalStateException("Split cannot be cancelled");
    return new SplitBill(
        id,
        ownerCustomerId,
        receivingAccountId,
        total,
        payerShare,
        participants.stream().map(SplitParticipant::cancel).toList(),
        note,
        Status.CANCELLED,
        version + 1,
        createdAt,
        expiresAt,
        at);
  }
}
