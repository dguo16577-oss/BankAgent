package com.asterbank.banking.customer.payment.domain;

import com.asterbank.banking.customer.account.domain.Account;
import com.asterbank.banking.customer.transaction.domain.TransactionId;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.OffsetDateTime;

/**
 * Completed receipt: execution-time source snapshot before debit; reviewed terms remain on intent.
 */
public record Transfer(
    String id,
    CustomerId customerId,
    IntentTerms terms,
    Account sourceAccount,
    Recipient recipient,
    TransactionId transactionId,
    String reference,
    OffsetDateTime completedAt) {}
