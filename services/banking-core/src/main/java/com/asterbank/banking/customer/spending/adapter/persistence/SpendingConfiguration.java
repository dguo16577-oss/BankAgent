package com.asterbank.banking.customer.spending.adapter.persistence;

import com.asterbank.banking.customer.spending.application.*;
import com.asterbank.banking.shared.adapter.persistence.DatabaseScope;
import java.time.Clock;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

@Configuration(proxyBeanMethods = false)
@Profile("!unit")
public class SpendingConfiguration {
  @Bean
  PostgreSqlTransactionAnalytics transactionAnalyticsPort(
      NamedParameterJdbcTemplate sql, DatabaseScope db) {
    return new PostgreSqlTransactionAnalytics(sql, db);
  }

  @Bean
  SpendingQueryService spendingQueryService(TransactionAnalyticsPort port, Clock clock) {
    return new SpendingQueryService(port, clock);
  }
}
