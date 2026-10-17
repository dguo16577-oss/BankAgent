package com.asterbank.banking.customer.payment.domain;

import com.asterbank.banking.customer.account.domain.Account;
import com.asterbank.banking.shared.domain.*;
import java.time.OffsetDateTime;

public record IntentTerms(
    String id,
    CustomerId customerId,
    Account sourceAccount,
    Recipient recipient,
    Money amount,
    Money fee,
    Money totalDebit,
    Money projectedAvailableBalance,
    String note,
    OffsetDateTime createdAt,
    OffsetDateTime expiresAt,
    String sessionId,
    String authorizationRequirement,
    String policyVersion) {
  public IntentTerms(
      String id,
      CustomerId customerId,
      Account sourceAccount,
      Recipient recipient,
      Money amount,
      Money fee,
      Money totalDebit,
      Money projectedAvailableBalance,
      String note,
      OffsetDateTime createdAt,
      OffsetDateTime expiresAt) {
    this(
        id,
        customerId,
        sourceAccount,
        recipient,
        amount,
        fee,
        totalDebit,
        projectedAvailableBalance,
        note,
        createdAt,
        expiresAt,
        null,
        null,
        null);
  }
}
