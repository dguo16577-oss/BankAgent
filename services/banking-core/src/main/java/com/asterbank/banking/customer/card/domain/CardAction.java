package com.asterbank.banking.customer.card.domain;

import java.time.OffsetDateTime;

public record CardAction(
    String id, CardIntentTerms terms, Card card, String reference, OffsetDateTime completedAt) {}
