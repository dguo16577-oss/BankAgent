package com.asterbank.banking.customer.wealth.domain;

import com.asterbank.banking.shared.domain.Money;
import java.math.*;
import java.time.OffsetDateTime;
import java.util.*;

public record Portfolio(List<Position> positions, OffsetDateTime asOf) {
  public Portfolio {
    positions = List.copyOf(positions);
  }

  private Money sum(java.util.function.Function<Position, Money> f) {
    return positions.stream().map(f).reduce(Money.of("0", "CNY"), Money::add);
  }

  public Money totalValue() {
    return sum(Position::currentValue);
  }

  public Money investedAmount() {
    return sum(Position::investedAmount);
  }

  public Money gainLoss() {
    return totalValue().subtract(investedAmount());
  }

  public Money monthlyChange() {
    return sum(Position::monthlyChange);
  }

  public Money monthlyNetContributions() {
    return sum(Position::monthlyNetContributions);
  }

  public int version() {
    return positions.stream().mapToInt(Position::version).sum();
  }

  public String monthlyChangePercent() {
    var start = totalValue().subtract(monthlyNetContributions()).subtract(monthlyChange()).amount();
    return start.signum() <= 0
        ? null
        : monthlyChange()
            .amount()
            .multiply(new BigDecimal("100"))
            .divide(start, 2, RoundingMode.HALF_UP)
            .toPlainString();
  }
}
