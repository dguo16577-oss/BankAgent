package com.asterbank.banking.customer.overview.application;

import com.asterbank.banking.customer.account.application.AccountSnapshot;
import com.asterbank.banking.customer.card.domain.Card;
import com.asterbank.banking.customer.recurring.application.RecurringUpcomingQuery;
import com.asterbank.banking.customer.spending.application.SpendingDashboardQuery;
import com.asterbank.banking.customer.transaction.domain.Transaction;
import com.asterbank.banking.customer.wealth.domain.Portfolio;
import com.asterbank.banking.shared.application.CustomerProfileQuery;
import java.time.OffsetDateTime;
import java.util.List;

public record CustomerOverviewView(
    OffsetDateTime asOf,
    CustomerProfileQuery.Profile user,
    AccountSnapshot accounts,
    SpendingDashboardQuery.Dashboard spending,
    List<Transaction> recentTransactions,
    List<Card> cards,
    List<RecurringUpcomingQuery.Upcoming> upcomingPayments,
    Portfolio wealth) {
  public CustomerOverviewView {
    recentTransactions = List.copyOf(recentTransactions);
    cards = List.copyOf(cards);
    upcomingPayments = List.copyOf(upcomingPayments);
  }
}
