package com.asterbank.banking.customer.wealth.domain;

import com.asterbank.banking.shared.domain.CustomerId;
import java.time.OffsetDateTime;

public record RiskProfile(
    CustomerId customerId,
    String displayName,
    RiskLevel riskLevel,
    int version,
    OffsetDateTime assessedAt,
    OffsetDateTime expiresAt) {}
