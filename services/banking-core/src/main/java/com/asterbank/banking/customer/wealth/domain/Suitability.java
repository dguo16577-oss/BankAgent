package com.asterbank.banking.customer.wealth.domain;

import com.asterbank.banking.shared.domain.CustomerId;
import java.time.OffsetDateTime;
import java.util.List;

public record Suitability(
    String id,
    CustomerId customerId,
    String productId,
    RiskLevel userRiskLevel,
    RiskLevel productRiskLevel,
    int productVersion,
    int riskProfileVersion,
    Result result,
    List<String> reasons,
    OffsetDateTime createdAt,
    OffsetDateTime expiresAt) {
  public enum Result {
    SUITABLE,
    NOT_SUITABLE
  }

  public Suitability {
    reasons = List.copyOf(reasons);
  }
}
