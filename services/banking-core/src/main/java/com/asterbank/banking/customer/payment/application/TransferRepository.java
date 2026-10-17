package com.asterbank.banking.customer.payment.application;

import com.asterbank.banking.customer.payment.domain.Transfer;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.Optional;

public interface TransferRepository {
  Optional<Transfer> find(CustomerId customer, String id);

  void save(Transfer transfer);
}
