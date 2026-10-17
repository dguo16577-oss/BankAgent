package com.asterbank.banking.customer.wealth.application;

import com.asterbank.banking.customer.wealth.domain.Portfolio;
import com.asterbank.banking.shared.domain.CustomerId;

/** Customer-scoped read capability; no HTTP or Overview-specific DTO. */
public interface PortfolioQuery {
  Portfolio portfolio(CustomerId owner);
}
