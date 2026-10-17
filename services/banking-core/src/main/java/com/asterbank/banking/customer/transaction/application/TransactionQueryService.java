package com.asterbank.banking.customer.transaction.application;

import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.customer.transaction.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.List;

public final class TransactionQueryService implements TransactionReadPort {
  private final TransactionRepository repository;
  private final TransactionAccountPort accounts;
  private final CursorCodec cursors;

  public TransactionQueryService(
      TransactionRepository repository, TransactionAccountPort accounts, CursorCodec cursors) {
    this.repository = repository;
    this.accounts = accounts;
    this.cursors = cursors;
  }

  public TransactionPage list(CustomerId customer, TransactionFilter filter, String cursor) {
    return repository.read(() -> listConsistently(customer, filter, cursor));
  }

  private TransactionPage listConsistently(
      CustomerId customer, TransactionFilter filter, String cursor) {
    String scope = cursors.scope(customer, filter, repository.snapshotRevision(customer));
    CursorCodec.Anchor anchor = cursor == null ? null : cursors.decode(cursor, scope);
    if (anchor != null && !repository.containsAnchor(customer, filter, anchor))
      throw new InvalidCursor();
    var window = repository.window(customer, filter, anchor);
    boolean more = window.size() > filter.limit();
    var items = window.stream().limit(filter.limit()).toList();
    return new TransactionPage(items, more ? cursors.encode(items.getLast(), scope) : null, more);
  }

  public TransactionDetailView detail(CustomerId customer, TransactionId id) {
    return repository.read(() -> detailConsistently(customer, id));
  }

  private TransactionDetailView detailConsistently(CustomerId customer, TransactionId id) {
    Transaction transaction = repository.find(customer, id).orElseThrow(TransactionNotFound::new);
    return new TransactionDetailView(
        transaction,
        accounts.find(customer, transaction.accountId()).orElseThrow(TransactionNotFound::new));
  }

  public List<Transaction> recent(CustomerId customer, AccountId account, int limit) {
    return list(
            customer,
            new TransactionFilter(account, null, null, null, null, null, null, null, "", limit),
            null)
        .items();
  }
}
