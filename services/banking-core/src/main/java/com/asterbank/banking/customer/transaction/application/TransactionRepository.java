package com.asterbank.banking.customer.transaction.application;

import com.asterbank.banking.customer.transaction.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.List;
import java.util.Optional;

public interface TransactionRepository
    extends com.asterbank.banking.shared.application.ConsistentRead {
  List<Transaction> matching(CustomerId customer, TransactionFilter filter);

  Optional<Transaction> find(CustomerId customer, TransactionId id);

  String snapshotRevision();

  default String snapshotRevision(CustomerId customer) {
    return snapshotRevision();
  }

  default boolean containsAnchor(
      CustomerId customer, TransactionFilter filter, CursorCodec.Anchor anchor) {
    return matching(customer, filter).stream()
        .anyMatch(
            t ->
                t.id().equals(anchor.id())
                    && t.occurredAt().toInstant().equals(anchor.occurredAt()));
  }

  default List<Transaction> window(
      CustomerId customer, TransactionFilter filter, CursorCodec.Anchor anchor) {
    return matching(customer, filter).stream()
        .filter(
            t ->
                anchor == null
                    || t.occurredAt().toInstant().isBefore(anchor.occurredAt())
                    || (t.occurredAt().toInstant().equals(anchor.occurredAt())
                        && Transaction.compareCodePoints(t.id().value(), anchor.id().value()) > 0))
        .limit(filter.limit() + 1L)
        .toList();
  }
}
