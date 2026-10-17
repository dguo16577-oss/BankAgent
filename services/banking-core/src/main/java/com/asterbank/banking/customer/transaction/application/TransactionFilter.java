package com.asterbank.banking.customer.transaction.application;

import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.customer.transaction.domain.*;
import com.asterbank.banking.shared.domain.CardId;
import java.time.OffsetDateTime;
import java.util.Locale;

public record TransactionFilter(
    AccountId accountId,
    CardId cardId,
    OffsetDateTime from,
    OffsetDateTime to,
    TransactionStatus status,
    TransactionDirection direction,
    TransactionType type,
    TransactionCategory category,
    String search,
    int limit) {
  public TransactionFilter {
    search = search == null ? "" : search.strip().toLowerCase(Locale.ROOT);
    if (search.length() > 100
        || limit < 1
        || limit > 50
        || (from != null && to != null && !from.toInstant().isBefore(to.toInstant())))
      throw new InvalidQuery();
  }

  public static TransactionFilter defaults() {
    return new TransactionFilter(null, null, null, null, null, null, null, null, "", 10);
  }

  public boolean matches(Transaction t) {
    return (accountId == null || accountId.equals(t.accountId()))
        && (cardId == null || cardId.equals(t.cardId()))
        && (from == null || !t.occurredAt().toInstant().isBefore(from.toInstant()))
        && (to == null || t.occurredAt().toInstant().isBefore(to.toInstant()))
        && (status == null || status == t.status())
        && (direction == null || direction == t.direction())
        && (type == null || type == t.type())
        && (category == null || category == t.category())
        && (search.isEmpty()
            || contains(t.title())
            || contains(t.note())
            || (t.merchant() != null && contains(t.merchant().name()))
            || (t.counterparty() != null && contains(t.counterparty().name())));
  }

  private boolean contains(String value) {
    return value != null && value.toLowerCase(Locale.ROOT).contains(search);
  }
}
