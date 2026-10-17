package com.asterbank.banking.customer.transaction.application;

import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.Optional;

/** Narrow read dependency; no dependency on Account application service. */
public interface TransactionAccountPort {
  Optional<Account> find(CustomerId customer, AccountId account);
}
