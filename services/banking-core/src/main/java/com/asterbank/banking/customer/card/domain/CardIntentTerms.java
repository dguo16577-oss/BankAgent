package com.asterbank.banking.customer.card.domain;

import java.time.OffsetDateTime;

/** Immutable review terms; the original Card and complete before/after controls are retained. */
public record CardIntentTerms(
    String id,
    Card card,
    CardActionType actionType,
    Card.Change change,
    OffsetDateTime createdAt,
    OffsetDateTime expiresAt) {}
