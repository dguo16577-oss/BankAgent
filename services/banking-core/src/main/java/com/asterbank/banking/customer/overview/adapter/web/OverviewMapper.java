package com.asterbank.banking.customer.overview.adapter.web;

import static com.asterbank.banking.shared.web.ReadModelMapper.*;

import com.asterbank.banking.customer.card.adapter.web.CardMapper;
import com.asterbank.banking.customer.overview.application.CustomerOverviewView;
import com.asterbank.banking.shared.web.ReadModelMapper;
import com.asterbank.contract.customer.model.*;

public final class OverviewMapper {
  private OverviewMapper() {}

  private static Money value(java.math.BigDecimal value, String currency) {
    return money(com.asterbank.banking.shared.domain.Money.of(value.toPlainString(), currency));
  }

  public static Overview map(CustomerOverviewView v) {
    var s = v.spending().summary();
    var w = v.wealth();
    return new Overview(
            time(v.asOf()),
            Overview.BaseCurrencyEnum.CNY,
            new User(v.user().id().value(), v.user().displayName()),
            money(v.accounts().totalBalance()))
        .balanceNote(
            "CNY equivalent (estimated). Deposit balances only; investments and card liabilities are excluded. DEMO_RATE conversions are estimates, not executable rates.")
        .accounts(v.accounts().accounts().stream().map(ReadModelMapper::account).toList())
        .exchangeEquivalents(
            v.accounts().accounts().stream()
                .filter(a -> a.equivalent() != null)
                .map(a -> equivalent(a.equivalent()))
                .toList())
        .spending(
            new OverviewSpendingSummary(
                new SpendingComparisonPeriod(
                    time(s.period().from()),
                    time(s.period().to()),
                    value(s.totalSpend(), s.currency())),
                new SpendingComparisonPeriod(
                    time(s.comparisonPeriod().from()),
                    time(s.comparisonPeriod().to()),
                    value(s.comparisonTotalSpend(), s.currency())),
                s.percentageChange(),
                v.spending().trend().stream()
                    .map(
                        t ->
                            new OverviewSpendingTrendPoint(
                                time(t.periodStart()), value(t.amount(), s.currency())))
                    .toList()))
        .recentTransactions(
            v.recentTransactions().stream().map(ReadModelMapper::transaction).toList())
        .cards(v.cards().stream().map(CardMapper::summary).toList())
        .upcomingPayments(
            v.upcomingPayments().stream()
                .map(
                    p ->
                        new UpcomingPayment(
                            p.id(),
                            p.title(),
                            time(p.dueAt()),
                            money(p.amount()),
                            UpcomingPayment.TypeEnum.RECURRING))
                .toList())
        .wealth(
            new WealthSummary(
                money(w.totalValue()),
                money(w.monthlyChange()),
                w.monthlyChangePercent(),
                w.positions().stream()
                    .map(p -> new HoldingSummary(p.id(), p.displayName(), money(p.currentValue())))
                    .toList()));
  }
}
