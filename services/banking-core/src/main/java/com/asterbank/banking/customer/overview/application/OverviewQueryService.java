package com.asterbank.banking.customer.overview.application;

import com.asterbank.banking.customer.account.application.AccountQueryService;
import com.asterbank.banking.customer.card.application.CardService;
import com.asterbank.banking.customer.recurring.application.RecurringUpcomingQuery;
import com.asterbank.banking.customer.spending.application.SpendingDashboardQuery;
import com.asterbank.banking.customer.transaction.application.TransactionReadPort;
import com.asterbank.banking.customer.wealth.application.PortfolioQuery;
import com.asterbank.banking.shared.application.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.*;

/** Derived view only. The supplied boundary joins all source reads into one database snapshot. */
public final class OverviewQueryService {
  private final ConsistentRead reads;
  private final CustomerProfileQuery profiles;
  private final AccountQueryService accounts;
  private final TransactionReadPort transactions;
  private final CardService cards;
  private final RecurringUpcomingQuery recurring;
  private final SpendingDashboardQuery spending;
  private final PortfolioQuery wealth;
  private final Clock clock;

  public OverviewQueryService(
      ConsistentRead reads,
      CustomerProfileQuery profiles,
      AccountQueryService accounts,
      TransactionReadPort transactions,
      CardService cards,
      RecurringUpcomingQuery recurring,
      SpendingDashboardQuery spending,
      PortfolioQuery wealth,
      Clock clock) {
    this.reads = reads;
    this.profiles = profiles;
    this.accounts = accounts;
    this.transactions = transactions;
    this.cards = cards;
    this.recurring = recurring;
    this.spending = spending;
    this.wealth = wealth;
    this.clock = clock;
  }

  public CustomerOverviewView query(CustomerId owner) {
    return reads.read(
        () -> {
          var at = OffsetDateTime.now(clock);
          return new CustomerOverviewView(
              at,
              profiles.profile(owner),
              accounts.list(owner),
              spending.query(owner),
              transactions.recent(owner, null, 5),
              cards.list(owner),
              recurring.upcoming(owner, at, 4),
              wealth.portfolio(owner));
        });
  }
}
