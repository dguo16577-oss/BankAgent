package com.asterbank.banking.customer.applicationrequest.domain;

import com.asterbank.banking.shared.domain.CustomerId;
import java.time.OffsetDateTime;

public record ProductApplication(
    String id,
    CustomerId owner,
    String productTitle,
    String productType,
    String maskedAccountNumber,
    ApplicationRequest request,
    OffsetDateTime submittedAt) {}
