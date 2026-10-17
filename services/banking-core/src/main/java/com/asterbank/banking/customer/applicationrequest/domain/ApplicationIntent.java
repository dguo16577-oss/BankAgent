package com.asterbank.banking.customer.applicationrequest.domain;

import com.asterbank.banking.customer.payment.domain.RecipientAction;
import com.asterbank.banking.security.domain.VerificationAction;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.Instant;

public record ApplicationIntent(
    String id,
    CustomerId owner,
    String session,
    ApplicationRequest request,
    VerificationAction action,
    String hash,
    Instant createdAt,
    Instant expiresAt,
    String applicationId,
    String authorizationId,
    Status status) {
  public enum Status {
    PREPARED,
    SUBMITTED,
    CANCELLED,
    EXPIRED
  }

  public ApplicationIntent(
      String id,
      CustomerId owner,
      String session,
      ApplicationRequest request,
      VerificationAction action,
      String hash,
      Instant createdAt,
      Instant expiresAt,
      String applicationId,
      String authorizationId) {
    this(
        id,
        owner,
        session,
        request,
        action,
        hash,
        createdAt,
        expiresAt,
        applicationId,
        authorizationId,
        applicationId == null ? Status.PREPARED : Status.SUBMITTED);
  }

  public static String hash(
      String id,
      CustomerId owner,
      String session,
      ApplicationRequest r,
      VerificationAction action) {
    return RecipientAction.digest(
        id,
        owner.value(),
        session,
        action.name(),
        r.productId(),
        r.accountId(),
        r.contactEmail(),
        Boolean.toString(r.consent()),
        r.monthlyIncome() == null ? null : r.monthlyIncome().decimal(),
        r.requestedAmount() == null ? null : r.requestedAmount().decimal(),
        r.termMonths() == null ? null : r.termMonths().toString(),
        r.purpose(),
        r.applicationDetails() == null ? null : r.applicationDetails().toString());
  }
}
