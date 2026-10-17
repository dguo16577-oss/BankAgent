package com.asterbank.banking.customer.account.application;

import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.customer.transaction.application.TransactionReadPort;
import com.asterbank.banking.shared.domain.*;

public final class AccountQueryService {
  private final AccountRepository accounts;
  private final TransactionReadPort transactions;

  public AccountQueryService(AccountRepository accounts, TransactionReadPort transactions) {
    this.accounts = accounts;
    this.transactions = transactions;
  }

  public AccountSnapshot list(CustomerId customer) {
    return accounts.snapshot(customer);
  }

  public AccountView detail(CustomerId customer, AccountId id) {
    return accounts.read(() -> detailConsistently(customer, id));
  }

  private AccountView detailConsistently(CustomerId customer, AccountId id) {
    Account account = accounts.find(customer, id).orElseThrow(AccountNotFound::new);
    return new AccountView(
        account, accounts.snapshot(customer).asOf(), transactions.recent(customer, id, 5));
  }
}
