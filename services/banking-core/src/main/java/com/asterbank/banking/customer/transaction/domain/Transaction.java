package com.asterbank.banking.customer.transaction.domain;

import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.shared.domain.*;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.Objects;

public record Transaction(
    TransactionId id,
    CustomerId customerId,
    AccountId accountId,
    String title,
    Money amount,
    TransactionDirection direction,
    TransactionStatus status,
    TransactionType type,
    TransactionCategory category,
    OffsetDateTime occurredAt,
    OffsetDateTime bookedAt,
    Merchant merchant,
    Counterparty counterparty,
    CardId cardId,
    String cardMaskedNumber,
    String reference,
    String note) {
  public Transaction(
      TransactionId id,
      CustomerId customerId,
      AccountId accountId,
      String title,
      Money amount,
      TransactionDirection direction,
      TransactionStatus status,
      TransactionType type,
      TransactionCategory category,
      OffsetDateTime occurredAt,
      OffsetDateTime bookedAt,
      Merchant merchant,
      Counterparty counterparty,
      CardId cardId,
      String cardMaskedNumber,
      String reference) {
    this(
        id,
        customerId,
        accountId,
        title,
        amount,
        direction,
        status,
        type,
        category,
        occurredAt,
        bookedAt,
        merchant,
        counterparty,
        cardId,
        cardMaskedNumber,
        reference,
        null);
  }

  public static final Comparator<Transaction> ORDER =
      Comparator.comparing((Transaction t) -> t.occurredAt().toInstant())
          .reversed()
          .thenComparing(t -> t.id().value(), Transaction::compareCodePoints);

  public Transaction {
    Objects.requireNonNull(id);
    Objects.requireNonNull(customerId);
    Objects.requireNonNull(accountId);
    Objects.requireNonNull(occurredAt);
    if (amount.amount().signum() < 0)
      throw new IllegalArgumentException("Transaction amount must be non-negative");
    if (merchant != null && counterparty != null)
      throw new IllegalArgumentException("Merchant and counterparty are distinct");
    if (note != null && note.length() > 140)
      throw new IllegalArgumentException("Transaction note exceeds 140 characters");
  }

  public static int compareCodePoints(String a, String b) {
    var left = a.codePoints().iterator();
    var right = b.codePoints().iterator();
    while (left.hasNext() && right.hasNext()) {
      int result = Integer.compare(left.nextInt(), right.nextInt());
      if (result != 0) return result;
    }
    return Boolean.compare(left.hasNext(), right.hasNext());
  }
}
