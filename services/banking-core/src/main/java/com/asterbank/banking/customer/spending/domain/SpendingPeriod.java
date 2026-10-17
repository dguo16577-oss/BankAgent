package com.asterbank.banking.customer.spending.domain;

import java.time.*;

public record SpendingPeriod(OffsetDateTime from, OffsetDateTime to) {
  public static final ZoneOffset REPORTING_OFFSET = ZoneOffset.ofHours(8);

  public SpendingPeriod {
    if (from == null
        || to == null
        || !to.isAfter(from)
        || Duration.between(from, to).compareTo(Duration.ofDays(366)) > 0)
      throw new IllegalArgumentException("Invalid reporting period");
  }

  public SpendingPeriod previousMonth() {
    var start = from.withOffsetSameInstant(REPORTING_OFFSET).minusMonths(1);
    var end = to.withOffsetSameInstant(REPORTING_OFFSET).minusMonths(1);
    if (!end.isAfter(start))
      end = start.toLocalDate().plusDays(1).atStartOfDay().atOffset(REPORTING_OFFSET);
    return new SpendingPeriod(start, end);
  }
}
