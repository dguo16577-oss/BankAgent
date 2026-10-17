package com.asterbank.banking.customer.spending.adapter.web;

import com.asterbank.banking.customer.spending.domain.SpendingReport;
import com.asterbank.contract.customer.model.*;
import java.math.BigDecimal;

public final class SpendingMapper {
  private SpendingMapper() {}

  private static SpendingPeriod period(
      com.asterbank.banking.customer.spending.domain.SpendingPeriod p) {
    return new SpendingPeriod(
        java.time.format.DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(p.from()),
        java.time.format.DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(p.to()));
  }

  private static Money money(BigDecimal amount, String currency) {
    return new Money(amount.setScale(2).toPlainString(), Money.CurrencyEnum.fromValue(currency));
  }

  public static SpendingSummary summary(SpendingReport r) {
    var c = r.currency();
    return new SpendingSummary(
        period(r.period()),
        period(r.comparisonPeriod()),
        c,
        r.accountIds(),
        money(r.totalSpend(), c),
        money(r.comparisonTotalSpend(), c),
        money(r.absoluteChange(), c),
        r.percentageChange(),
        r.categoryBreakdown().stream()
            .map(
                x ->
                    new SpendingCategoryBreakdown(
                        TransactionCategory.valueOf(x.category()),
                        money(x.amount(), c),
                        r.totalSpend().signum() == 0
                            ? "0.00"
                            : SpendingReport.percentage(x.amount(), r.totalSpend()),
                        Math.toIntExact(x.transactionCount())))
            .toList(),
        r.trend().stream()
            .map(
                x ->
                    new SpendingTrendPoint(
                        period(x.period()),
                        money(x.amount(), c),
                        Math.toIntExact(x.transactionCount())))
            .toList(),
        r.topMerchants().stream()
            .map(
                x ->
                    new SpendingMerchantBreakdown(
                        x.merchantId(),
                        x.merchantName(),
                        money(x.amount(), c),
                        Math.toIntExact(x.transactionCount())))
            .toList(),
        Math.toIntExact(r.transactionCount()),
        java.time.format.DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(r.asOf()));
  }
}
