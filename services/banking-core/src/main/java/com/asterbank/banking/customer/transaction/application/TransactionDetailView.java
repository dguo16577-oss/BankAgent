package com.asterbank.banking.customer.transaction.application;

import com.asterbank.banking.customer.account.domain.Account;
import com.asterbank.banking.customer.transaction.domain.Transaction;

public record TransactionDetailView(Transaction transaction, Account account) {}
