package com.asterbank.banking.customer.payment.application;

import com.asterbank.banking.shared.domain.CustomerId;
import java.util.Optional;

public interface IdempotencyRepository {
  record Scope(CustomerId customer, String operation, String key) {}

  record Completed(Scope scope, String fingerprint, String resourceId) {}

  Optional<Completed> find(Scope scope);

  void save(Completed record);
}
