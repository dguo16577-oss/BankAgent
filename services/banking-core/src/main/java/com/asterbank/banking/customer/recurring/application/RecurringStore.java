package com.asterbank.banking.customer.recurring.application;

import com.asterbank.banking.customer.recurring.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.*;
import java.util.function.Supplier;

public interface RecurringStore {
  <T> T read(Supplier<T> work);

  <T> T write(Supplier<T> work);

  List<RecurringPayment> list(CustomerId owner);

  Optional<RecurringPayment> payment(CustomerId owner, String id);

  Optional<RecurringIntent> intent(CustomerId owner, String id);

  Optional<RecurringAction> action(CustomerId owner, String id);

  void save(RecurringPayment payment);

  void save(RecurringIntent intent);

  void save(RecurringAction action);
}
