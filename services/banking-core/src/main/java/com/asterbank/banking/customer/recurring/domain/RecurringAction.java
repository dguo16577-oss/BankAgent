package com.asterbank.banking.customer.recurring.domain;

import java.time.OffsetDateTime;

public record RecurringAction(
    String id,
    RecurringIntent.Terms terms,
    RecurringPayment payment,
    String reference,
    OffsetDateTime effectiveAt) {}
