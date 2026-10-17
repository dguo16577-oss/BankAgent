package com.asterbank.banking.customer.account.application;

import com.asterbank.banking.customer.account.domain.Account;
import com.asterbank.banking.customer.transaction.domain.Transaction;
import java.time.OffsetDateTime;
import java.util.List;

public record AccountView(
    Account account, OffsetDateTime asOf, List<Transaction> recentTransactions) {
  public AccountView {
    recentTransactions = List.copyOf(recentTransactions);
  }
}
