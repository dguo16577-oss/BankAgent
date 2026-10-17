package com.asterbank.banking.customer.wealth.domain;

import java.time.OffsetDateTime;

public record InvestmentOrder(
    String id,
    InvestmentIntent.Terms terms,
    String transactionId,
    String positionId,
    String reference,
    OffsetDateTime completedAt) {}
