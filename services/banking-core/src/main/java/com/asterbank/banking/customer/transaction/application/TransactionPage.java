package com.asterbank.banking.customer.transaction.application;

import com.asterbank.banking.customer.transaction.domain.Transaction;
import java.util.List;

public record TransactionPage(List<Transaction> items, String nextCursor, boolean hasMore) {
  public TransactionPage {
    items = List.copyOf(items);
  }
}
