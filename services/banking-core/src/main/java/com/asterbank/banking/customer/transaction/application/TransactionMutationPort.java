package com.asterbank.banking.customer.transaction.application;

import com.asterbank.banking.customer.transaction.domain.Transaction;

/** Called inside the transfer execution boundary; appending advances cursor revision. */
public interface TransactionMutationPort {
  void append(Transaction transaction);
}
