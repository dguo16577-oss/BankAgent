package com.asterbank.banking.customer.account.application;

import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.Optional;

public interface AccountRepository extends com.asterbank.banking.shared.application.ConsistentRead {
  AccountSnapshot snapshot(CustomerId customer);

  Optional<Account> find(CustomerId customer, AccountId account);
}
