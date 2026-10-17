package com.asterbank.banking.customer.transaction.application;

import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.customer.transaction.domain.Transaction;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.List;

public interface TransactionReadPort {
  List<Transaction> recent(CustomerId customer, AccountId account, int limit);
}
