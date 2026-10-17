package com.asterbank.banking.customer.payment.domain;

import com.asterbank.banking.shared.domain.CustomerId;
import java.util.Currency;
import java.util.Objects;

public record Recipient(
    RecipientId id,
    CustomerId customerId,
    String displayName,
    String bankName,
    String maskedAccountNumber,
    Currency currency,
    String destinationRef,
    Status status,
    java.time.OffsetDateTime createdAt,
    int version,
    String phoneMasked) {
  public enum Status {
    ACTIVE,
    INACTIVE
  }

  public Recipient(
      RecipientId id,
      CustomerId customerId,
      String displayName,
      String bankName,
      String maskedAccountNumber,
      Currency currency) {
    this(
        id,
        customerId,
        displayName,
        bankName,
        maskedAccountNumber,
        currency,
        id.value(),
        Status.ACTIVE,
        null,
        0,
        null);
  }

  public Recipient(
      RecipientId id,
      CustomerId customerId,
      String displayName,
      String bankName,
      String maskedAccountNumber,
      Currency currency,
      String destinationRef,
      Status status,
      java.time.OffsetDateTime createdAt,
      int version) {
    this(
        id,
        customerId,
        displayName,
        bankName,
        maskedAccountNumber,
        currency,
        destinationRef,
        status,
        createdAt,
        version,
        null);
  }

  public Recipient {
    if (destinationRef == null) destinationRef = id.value();
    if (status == null) status = Status.ACTIVE; // Legacy immutable receipt snapshots.
    Objects.requireNonNull(id);
    Objects.requireNonNull(customerId);
    Objects.requireNonNull(currency);
    if (!maskedAccountNumber.matches("•••• [0-9]{4}"))
      throw new IllegalArgumentException("Recipient identifier must be masked");
    if (phoneMasked != null && !phoneMasked.matches("1[3-9][0-9]\\*{4}[0-9]{4}"))
      throw new IllegalArgumentException("Recipient phone must be masked");
  }

  public Recipient deactivate() {
    return new Recipient(
        id,
        customerId,
        displayName,
        bankName,
        maskedAccountNumber,
        currency,
        destinationRef,
        Status.INACTIVE,
        createdAt,
        Math.incrementExact(version),
        phoneMasked);
  }

  /** A contact phone is discovery/display data, not the immutable transfer destination. */
  public boolean sameTransferIdentityAs(Recipient other) {
    return other != null
        && id.equals(other.id)
        && customerId.equals(other.customerId)
        && Objects.equals(displayName, other.displayName)
        && Objects.equals(bankName, other.bankName)
        && maskedAccountNumber.equals(other.maskedAccountNumber)
        && currency.equals(other.currency)
        && destinationRef.equals(other.destinationRef)
        && status == other.status
        && Objects.equals(createdAt, other.createdAt)
        && version == other.version;
  }
}
