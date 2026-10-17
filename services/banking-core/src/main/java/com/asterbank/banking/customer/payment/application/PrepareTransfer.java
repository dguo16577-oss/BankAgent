package com.asterbank.banking.customer.payment.application;

import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.customer.payment.domain.RecipientId;
import com.asterbank.banking.shared.domain.Money;

public record PrepareTransfer(
    AccountId sourceAccountId, RecipientId recipientId, Money amount, String note) {
  public PrepareTransfer {
    note = note == null ? "" : note.strip();
    if (note.length() > 140) throw new PaymentFailure(PaymentFailure.Code.INVALID_REQUEST);
  }
}
