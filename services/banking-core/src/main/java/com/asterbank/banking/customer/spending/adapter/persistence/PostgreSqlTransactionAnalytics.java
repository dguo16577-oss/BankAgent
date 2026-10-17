package com.asterbank.banking.customer.spending.adapter.persistence;

import com.asterbank.banking.customer.spending.application.*;
import com.asterbank.banking.customer.spending.domain.*;
import com.asterbank.banking.shared.adapter.persistence.DatabaseScope;
import com.asterbank.banking.shared.domain.CustomerId;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

public final class PostgreSqlTransactionAnalytics
    implements TransactionAnalyticsPort, MonthlySpendingPort {
  public List<MonthlySpendingPort.Month> monthly(CustomerId owner, SpendingPeriod period) {
    return db.read(
        () -> {
          var scope = new HashMap<String, Object>();
          scope.put("owner", owner.value());
          scope.put("account", null);
          scope.put("currency", "CNY");
          return sql.query(
              "SELECT date_trunc('month',t.occurred_at AT TIME ZONE 'Etc/GMT-8')::date AS month,sum(t.amount)"
                  + ELIGIBLE
                  + " GROUP BY month ORDER BY month",
              params(scope, period),
              (r, n) ->
                  new MonthlySpendingPort.Month(
                      r.getObject(1, LocalDate.class), r.getBigDecimal(2)));
        });
  }

  private final NamedParameterJdbcTemplate sql;
  private final DatabaseScope db;

  public PostgreSqlTransactionAnalytics(NamedParameterJdbcTemplate sql, DatabaseScope db) {
    this.sql = sql;
    this.db = db;
  }

  private static final String ELIGIBLE =
      """
 FROM transactions t JOIN accounts a ON a.account_id=t.account_id AND a.customer_id=t.customer_id
 WHERE t.customer_id=:owner AND t.currency=:currency AND a.currency=:currency
 AND (cast(:account AS varchar) IS NULL OR t.account_id=cast(:account AS varchar))
 AND t.status='COMPLETED' AND t.direction='DEBIT'
 AND t.type IN ('CARD_PAYMENT','DIRECT_DEBIT','FEE')
 AND t.category NOT IN ('TRANSFER','INVESTMENT')
 AND t.occurred_at>=:from AND t.occurred_at<:to
 """;

  public SpendingReport aggregate(
      CustomerId owner,
      String account,
      SpendingPeriod period,
      SpendingPeriod comparison,
      OffsetDateTime asOf) {
    try {
      return db.read(
          () -> {
            var scope = new HashMap<String, Object>();
            scope.put("owner", owner.value());
            scope.put("account", account);
            var accounts =
                sql.query(
                    "SELECT account_id,currency FROM accounts WHERE customer_id=:owner AND (cast(:account AS varchar) IS NULL AND currency='CNY' OR account_id=cast(:account AS varchar)) ORDER BY account_id COLLATE \"C\"",
                    scope,
                    (r, n) -> new String[] {r.getString(1), r.getString(2)});
            if (account != null && accounts.isEmpty())
              throw new SpendingFailure(SpendingFailure.Code.ACCOUNT_NOT_FOUND);
            String currency = accounts.isEmpty() ? "CNY" : accounts.getFirst()[1];
            scope.put("currency", currency);
            var p = params(scope, period);
            var cp = params(scope, comparison);
            var total =
                sql.queryForObject(
                    "SELECT coalesce(sum(t.amount),0)::numeric(24,2)" + ELIGIBLE,
                    p,
                    BigDecimal.class);
            var old =
                sql.queryForObject(
                    "SELECT coalesce(sum(t.amount),0)::numeric(24,2)" + ELIGIBLE,
                    cp,
                    BigDecimal.class);
            var count = sql.queryForObject("SELECT count(*)" + ELIGIBLE, p, Long.class);
            var cats =
                sql.query(
                    "SELECT t.category,sum(t.amount),count(*)"
                        + ELIGIBLE
                        + " GROUP BY t.category ORDER BY t.category COLLATE \"C\"",
                    p,
                    (r, n) ->
                        new SpendingReport.Category(
                            r.getString(1), r.getBigDecimal(2), r.getLong(3)));
            var merchants =
                sql.query(
                    "SELECT t.merchant_id,min(t.merchant_name),sum(t.amount),count(*)"
                        + ELIGIBLE
                        + " AND t.merchant_id IS NOT NULL GROUP BY t.merchant_id ORDER BY sum(t.amount) DESC,t.merchant_id COLLATE \"C\"",
                    p,
                    (r, n) ->
                        new SpendingReport.Merchant(
                            r.getString(1), r.getString(2), r.getBigDecimal(3), r.getLong(4)));
            var daily =
                sql.query(
                    "SELECT (t.occurred_at AT TIME ZONE 'Etc/GMT-8')::date AS day,sum(t.amount),count(*)"
                        + ELIGIBLE
                        + " GROUP BY day ORDER BY day",
                    p,
                    (r, n) ->
                        new Daily(
                            r.getObject(1, LocalDate.class), r.getBigDecimal(2), r.getLong(3)));
            var days = new HashMap<LocalDate, Daily>();
            daily.forEach(d -> days.put(d.day(), d));
            var trend = new ArrayList<SpendingReport.Trend>();
            for (var start = period.from(); start.isBefore(period.to()); ) {
              var day = start.withOffsetSameInstant(SpendingPeriod.REPORTING_OFFSET).toLocalDate();
              var end = day.plusDays(1).atStartOfDay().atOffset(SpendingPeriod.REPORTING_OFFSET);
              if (end.isAfter(period.to())) end = period.to();
              var d = days.getOrDefault(day, new Daily(day, new BigDecimal("0.00"), 0));
              trend.add(
                  new SpendingReport.Trend(new SpendingPeriod(start, end), d.amount(), d.count()));
              start = end;
            }
            return new SpendingReport(
                period,
                comparison,
                currency,
                accounts.stream().map(a -> a[0]).toList(),
                total,
                old,
                count,
                List.copyOf(cats),
                List.copyOf(merchants),
                List.copyOf(trend),
                asOf);
          });
    } catch (SpendingFailure e) {
      throw e;
    } catch (RuntimeException e) {
      throw new SpendingFailure(SpendingFailure.Code.PERSISTENCE_UNAVAILABLE);
    }
  }

  private Map<String, Object> params(Map<String, Object> scope, SpendingPeriod p) {
    var m = new HashMap<>(scope);
    m.put("from", p.from());
    m.put("to", p.to());
    return m;
  }

  private record Daily(LocalDate day, BigDecimal amount, long count) {}
}
