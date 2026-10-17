package com.asterbank.banking.customer.payment.domain;

import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.shared.domain.CustomerId;
import com.asterbank.banking.shared.domain.Money;
import java.util.Objects;

/** A verified local payee's request; creating it never debits that payee's account. */
public record SplitParticipant(
    String id,
    RecipientId recipientId,
    CustomerId targetCustomerId,
    AccountId targetAccountId,
    Money amountDue,
    Status status) {
  public enum Status {
    PENDING,
    PAID,
    DECLINED,
    EXPIRED,
    CANCELLED
  }

  public SplitParticipant {
    if (id == null || id.isBlank()) throw new IllegalArgumentException("Participant ID required");
    Objects.requireNonNull(recipientId);
    Objects.requireNonNull(targetCustomerId);
    Objects.requireNonNull(targetAccountId);
    Objects.requireNonNull(amountDue);
    Objects.requireNonNull(status);
    if (amountDue.amount().signum() <= 0)
      throw new IllegalArgumentException("Participant share must be positive");
  }

  public SplitParticipant cancel() {
    if (status != Status.PENDING) return this;
    return new SplitParticipant(
        id, recipientId, targetCustomerId, targetAccountId, amountDue, Status.CANCELLED);
  }
}
