package com.asterbank.banking.customer.recurring.application;

import com.asterbank.banking.shared.domain.*;
import java.time.OffsetDateTime;
import java.util.List;

/** Bank-managed ACTIVE schedules strictly after asOf; due time then opaque ID, limited in SQL. */
public interface RecurringUpcomingQuery {
  record Upcoming(String id, String title, OffsetDateTime dueAt, Money amount) {}

  List<Upcoming> upcoming(CustomerId owner, OffsetDateTime asOf, int limit);
}
