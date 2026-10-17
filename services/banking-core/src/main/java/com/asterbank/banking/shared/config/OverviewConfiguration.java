package com.asterbank.banking.shared.config;

import com.asterbank.banking.customer.account.application.*;
import com.asterbank.banking.customer.card.application.CardService;
import com.asterbank.banking.customer.overview.application.*;
import com.asterbank.banking.customer.recurring.application.*;
import com.asterbank.banking.customer.spending.application.*;
import com.asterbank.banking.customer.transaction.application.*;
import com.asterbank.banking.customer.wealth.application.PortfolioQuery;
import com.asterbank.banking.shared.adapter.persistence.*;
import com.asterbank.banking.shared.application.*;
import java.time.Clock;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration(proxyBeanMethods = false)
@Profile("!unit")
public class OverviewConfiguration {
  @Bean
  CustomerProfileQuery customerProfileQuery(DatabaseScope db, JdbcTemplate sql) {
    return new PostgreSqlCustomerProfileQuery(db, sql);
  }

  @Bean
  SpendingDashboardQuery spendingDashboardQuery(
      SpendingQueryService spending, MonthlySpendingPort monthly) {
    return new SpendingDashboardQuery(spending, monthly);
  }

  @Bean
  OverviewQueryService overviewQueryService(
      AccountRepository reads,
      CustomerProfileQuery profiles,
      AccountQueryService accounts,
      TransactionQueryService transactions,
      CardService cards,
      RecurringUpcomingQuery recurring,
      SpendingDashboardQuery spending,
      PortfolioQuery wealth,
      Clock clock) {
    return new OverviewQueryService(
        reads, profiles, accounts, transactions, cards, recurring, spending, wealth, clock);
  }
}
