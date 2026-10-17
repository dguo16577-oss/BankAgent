package com.asterbank.banking.customer.spending.application;

import com.asterbank.banking.customer.spending.domain.SpendingPeriod;
import com.asterbank.banking.shared.domain.CustomerId;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Same eligibility and reporting timezone as Spending; SQL sums over all matching transactions. */
public interface MonthlySpendingPort {
  record Month(LocalDate start, BigDecimal amount) {}

  List<Month> monthly(CustomerId owner, SpendingPeriod period);
}
