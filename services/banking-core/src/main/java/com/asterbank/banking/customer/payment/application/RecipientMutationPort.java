package com.asterbank.banking.customer.payment.application;

import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.Optional;
import java.util.function.Supplier;

public interface RecipientMutationPort {
  <T> T write(CustomerId owner, Supplier<T> action);

  Optional<Recipient> destination(CustomerId owner, String destination);

  void save(Recipient recipient);

  void save(RecipientAction intent);

  Optional<RecipientAction> intent(CustomerId owner, String id);

  Optional<Recipient> result(CustomerId owner, String intentId);

  void complete(CustomerId owner, String intentId, Recipient result);
}
