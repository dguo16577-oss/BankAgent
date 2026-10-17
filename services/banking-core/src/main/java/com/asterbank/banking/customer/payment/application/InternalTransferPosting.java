package com.asterbank.banking.customer.payment.application;

import com.asterbank.banking.customer.payment.domain.Transfer;
import com.asterbank.banking.shared.domain.CustomerId;

/** Optional local demo posting to a second bank-owned customer account. */
public interface InternalTransferPosting {
  void lockParticipants(CustomerId sender, String intentId);

  void creditRecipient(Transfer transfer);
}
