package com.asterbank.banking.customer.spending.application;

import com.asterbank.banking.customer.spending.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.*;

public final class SpendingDashboardQuery {
  public record Month(OffsetDateTime periodStart, BigDecimal amount) {}

  public record Dashboard(SpendingReport summary, List<Month> trend) {
    public Dashboard {
      trend = List.copyOf(trend);
    }
  }

  private final SpendingQueryService spending;
  private final MonthlySpendingPort monthly;

  public SpendingDashboardQuery(SpendingQueryService spending, MonthlySpendingPort monthly) {
    this.spending = spending;
    this.monthly = monthly;
  }

  public Dashboard query(CustomerId owner) {
    var report = spending.query(owner, Map.of());
    var current = report.period().from().withOffsetSameInstant(SpendingPeriod.REPORTING_OFFSET);
    var start = current.minusMonths(5);
    var amounts = new HashMap<java.time.LocalDate, BigDecimal>();
    monthly
        .monthly(owner, new SpendingPeriod(start, report.period().to()))
        .forEach(m -> amounts.put(m.start(), m.amount()));
    var trend = new ArrayList<Month>();
    for (int i = 0; i < 6; i++) {
      var at = start.plusMonths(i);
      trend.add(new Month(at, amounts.getOrDefault(at.toLocalDate(), new BigDecimal("0.00"))));
    }
    return new Dashboard(report, trend);
  }
}
