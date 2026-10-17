package com.asterbank.banking.customer.wealth.domain;

import java.time.OffsetDateTime;

public record RedemptionOrder(
    String id,
    RedemptionIntent.Terms terms,
    String transactionId,
    String reference,
    OffsetDateTime completedAt) {}
