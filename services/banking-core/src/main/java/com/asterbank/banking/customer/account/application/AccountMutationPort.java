package com.asterbank.banking.customer.account.application;

import com.asterbank.banking.customer.account.domain.Account;
import java.time.OffsetDateTime;

/** Called inside the transfer execution boundary. */
public interface AccountMutationPort {
  void save(Account account, OffsetDateTime asOf);
}
