package com.asterbank.banking.customer.recurring.domain;

import static com.asterbank.banking.customer.recurring.domain.RecurringFailure.Code.*;

import com.asterbank.banking.customer.transaction.domain.Merchant;
import com.asterbank.banking.shared.domain.*;
import java.time.OffsetDateTime;
import java.util.List;

public record RecurringPayment(
    String id,
    CustomerId customerId,
    String displayName,
    Type type,
    Status status,
    Frequency frequency,
    Source source,
    String sourceAccountId,
    String cardId,
    Merchant merchant,
    Money usualAmount,
    OffsetDateTime nextExpectedAt,
    OffsetDateTime lastPaidAt,
    Capability managementCapability,
    int version,
    List<String> transactionHistory,
    Provenance detectionProvenance) {
  public enum Type {
    CARD_SUBSCRIPTION,
    DIRECT_DEBIT,
    STANDING_ORDER,
    DETECTED_RECURRING_PAYMENT
  }

  public enum Status {
    ACTIVE,
    STOPPED,
    ENDED
  }

  public enum Frequency {
    WEEKLY,
    MONTHLY,
    QUARTERLY,
    YEARLY,
    IRREGULAR
  }

  public enum Source {
    BANK_MANAGED,
    DETECTED_PATTERN
  }

  public enum Capability {
    STOP_FUTURE_PAYMENTS,
    NONE
  }

  public record State(
      Status status, OffsetDateTime nextExpectedAt, Capability managementCapability, int version) {}

  public record Provenance(
      List<String> matchedTransactionIds,
      int observedOccurrences,
      OffsetDateTime firstObservedAt,
      OffsetDateTime lastObservedAt) {
    public Provenance {
      matchedTransactionIds = List.copyOf(matchedTransactionIds);
      if (observedOccurrences < 2 || observedOccurrences != matchedTransactionIds.size())
        throw new IllegalArgumentException("Invalid provenance");
    }
  }

  public RecurringPayment {
    transactionHistory = List.copyOf(transactionHistory);
    if (version < 0 || usualAmount.amount().signum() < 0)
      throw new IllegalArgumentException("Invalid recurring state");
  }

  public void requireManageable() {
    if (status == Status.STOPPED) throw new RecurringFailure(RECURRING_PAYMENT_ALREADY_STOPPED);
    if (status != Status.ACTIVE
        || source != Source.BANK_MANAGED
        || managementCapability != Capability.STOP_FUTURE_PAYMENTS
        || type == Type.DETECTED_RECURRING_PAYMENT)
      throw new RecurringFailure(RECURRING_PAYMENT_NOT_MANAGEABLE);
  }

  public State state() {
    return new State(status, nextExpectedAt, managementCapability, version);
  }

  public RecurringPayment stop() {
    requireManageable();
    return new RecurringPayment(
        id,
        customerId,
        displayName,
        type,
        Status.STOPPED,
        frequency,
        source,
        sourceAccountId,
        cardId,
        merchant,
        usualAmount,
        null,
        lastPaidAt,
        managementCapability,
        Math.incrementExact(version),
        transactionHistory,
        detectionProvenance);
  }

  public String effectDescription() {
    return switch (type) {
      case CARD_SUBSCRIPTION -> "Block future recurring merchant payments through Aster Bank.";
      case DIRECT_DEBIT -> "Revoke the bank-side direct debit mandate.";
      case STANDING_ORDER -> "Cancel future scheduled bank payments.";
      default -> throw new RecurringFailure(RECURRING_PAYMENT_NOT_MANAGEABLE);
    };
  }
}
