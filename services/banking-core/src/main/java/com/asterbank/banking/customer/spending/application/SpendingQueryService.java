package com.asterbank.banking.customer.spending.application;

import com.asterbank.banking.customer.spending.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.*;
import java.util.Map;

public final class SpendingQueryService {
  private final TransactionAnalyticsPort port;
  private final Clock clock;

  public SpendingQueryService(TransactionAnalyticsPort port, Clock clock) {
    this.port = port;
    this.clock = clock;
  }

  public SpendingReport query(CustomerId owner, Map<String, String> q) {
    try {
      var at = OffsetDateTime.now(clock);
      var local = at.withOffsetSameInstant(SpendingPeriod.REPORTING_OFFSET);
      if (q.containsKey("from") != q.containsKey("to")
          || q.containsKey("compareFrom") != q.containsKey("compareTo"))
        throw new IllegalArgumentException();
      var p =
          q.containsKey("from")
              ? period(q.get("from"), q.get("to"))
              : new SpendingPeriod(
                  local
                      .toLocalDate()
                      .withDayOfMonth(1)
                      .atStartOfDay()
                      .atOffset(SpendingPeriod.REPORTING_OFFSET),
                  at);
      var compare =
          q.containsKey("compareFrom")
              ? period(q.get("compareFrom"), q.get("compareTo"))
              : p.previousMonth();
      return port.aggregate(owner, q.get("accountId"), p, compare, at);
    } catch (DateTimeException | IllegalArgumentException e) {
      throw new SpendingFailure(SpendingFailure.Code.INVALID_QUERY);
    }
  }

  private SpendingPeriod period(String f, String t) {
    for (var v : new String[] {f, t})
      if (v == null
          || !v.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})"))
        throw new IllegalArgumentException();
    return new SpendingPeriod(OffsetDateTime.parse(f), OffsetDateTime.parse(t));
  }
}
