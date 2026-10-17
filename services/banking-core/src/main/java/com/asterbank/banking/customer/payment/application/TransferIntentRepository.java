package com.asterbank.banking.customer.payment.application;

import com.asterbank.banking.customer.payment.domain.TransferIntent;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.Optional;

public interface TransferIntentRepository {
  Optional<TransferIntent> find(CustomerId customer, String id);

  void save(TransferIntent intent);

  void cancel(TransferIntent intent, String reason);

  record PrepareReplay(String fingerprint, String intentId) {}

  Optional<PrepareReplay> findPrepareReplay(CustomerId customer, String session, String key);

  void savePrepareReplay(
      CustomerId customer,
      String session,
      String key,
      String fingerprint,
      String intentId,
      java.time.OffsetDateTime createdAt);
}
