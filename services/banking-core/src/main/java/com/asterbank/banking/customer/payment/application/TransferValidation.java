package com.asterbank.banking.customer.payment.application;

import static com.asterbank.banking.customer.payment.application.PaymentFailure.Code.*;

import com.asterbank.banking.customer.account.application.AccountRepository;
import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;

public final class TransferValidation {
  private final AccountRepository accounts;
  private final RecipientRepository recipients;

  public TransferValidation(AccountRepository accounts, RecipientRepository recipients) {
    this.accounts = accounts;
    this.recipients = recipients;
  }

  public record Validated(Account source, Recipient recipient) {}

  public Validated validate(CustomerId customer, PrepareTransfer request) {
    if (request.amount() == null
        || request.amount().amount().signum() <= 0
        || request.amount().amount().precision() - request.amount().amount().scale() > 12)
      throw new PaymentFailure(INVALID_AMOUNT);
    var account =
        accounts
            .find(customer, request.sourceAccountId())
            .orElseThrow(() -> new PaymentFailure(ACCOUNT_NOT_FOUND));
    if (account.status() != AccountStatus.ACTIVE) throw new PaymentFailure(ACCOUNT_NOT_ELIGIBLE);
    if (account.type() == AccountType.TIME_DEPOSIT) throw new PaymentFailure(ACCOUNT_NOT_ELIGIBLE);
    var recipient =
        recipients
            .find(customer, request.recipientId())
            .orElseThrow(() -> new PaymentFailure(RECIPIENT_NOT_FOUND));
    var currency = request.amount().currency();
    if (recipient.status() != Recipient.Status.ACTIVE) throw new PaymentFailure(RECIPIENT_INACTIVE);
    if (!currency.getCurrencyCode().equals("CNY")
        || !account.balance().currency().equals(currency)
        || !recipient.currency().equals(currency)) throw new PaymentFailure(CURRENCY_MISMATCH);
    if (account.availableBalance().amount().compareTo(request.amount().amount()) < 0)
      throw new PaymentFailure(INSUFFICIENT_FUNDS);
    return new Validated(account, recipient);
  }
}
