package com.asterbank.banking.customer.spending.application;

import com.asterbank.banking.customer.spending.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.OffsetDateTime;

public interface TransactionAnalyticsPort {
  SpendingReport aggregate(
      CustomerId owner,
      String accountId,
      SpendingPeriod period,
      SpendingPeriod comparison,
      OffsetDateTime asOf);
}
