package com.asterbank.banking.customer.spending.domain;

import java.math.*;
import java.time.OffsetDateTime;
import java.util.List;

public record SpendingReport(
    SpendingPeriod period,
    SpendingPeriod comparisonPeriod,
    String currency,
    List<String> accountIds,
    BigDecimal totalSpend,
    BigDecimal comparisonTotalSpend,
    long transactionCount,
    List<Category> categoryBreakdown,
    List<Merchant> topMerchants,
    List<Trend> trend,
    OffsetDateTime asOf) {
  public record Category(String category, BigDecimal amount, long transactionCount) {}

  public record Merchant(
      String merchantId, String merchantName, BigDecimal amount, long transactionCount) {}

  public record Trend(SpendingPeriod period, BigDecimal amount, long transactionCount) {}

  public static String percentage(BigDecimal numerator, BigDecimal denominator) {
    return denominator.signum() == 0
        ? null
        : numerator
            .multiply(new BigDecimal("100"))
            .divide(denominator, 2, RoundingMode.HALF_UP)
            .toPlainString();
  }

  public BigDecimal absoluteChange() {
    return totalSpend.subtract(comparisonTotalSpend);
  }

  public String percentageChange() {
    return percentage(absoluteChange(), comparisonTotalSpend);
  }
}
