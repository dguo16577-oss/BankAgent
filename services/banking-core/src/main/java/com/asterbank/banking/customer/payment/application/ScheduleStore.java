package com.asterbank.banking.customer.payment.application;

import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.Instant;
import java.util.*;
import java.util.function.Supplier;

public interface ScheduleStore {
  <T> T write(CustomerId owner, Supplier<T> action);

  void lockRecipients(CustomerId owner, List<String> ids);

  void lockSchedule(CustomerId owner, String id);

  Optional<ScheduledPayment> find(CustomerId owner, String id);

  List<ScheduledPayment> list(CustomerId owner);

  List<ScheduledPayment> due(Instant now);

  void save(ScheduledPayment schedule);

  void save(ScheduleAction action);

  Optional<ScheduleAction> intent(CustomerId owner, String id);

  void lockIntent(CustomerId owner, String id);

  boolean cancelled(CustomerId owner, String id);

  boolean cancelIntent(CustomerId owner, String id, java.time.OffsetDateTime at);

  Optional<ScheduledPayment> result(CustomerId owner, String intentId);

  void complete(CustomerId owner, String intentId, ScheduledPayment result);
}
