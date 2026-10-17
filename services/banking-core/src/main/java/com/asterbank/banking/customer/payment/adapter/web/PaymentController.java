package com.asterbank.banking.customer.payment.adapter.web;

import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.payment.domain.RecipientId;
import com.asterbank.banking.shared.domain.Money;
import com.asterbank.banking.shared.security.CurrentCustomerProvider;
import com.asterbank.contract.customer.api.*;
import com.asterbank.contract.customer.model.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PaymentController
    implements GetRecipientsApi,
        CreateTransferIntentApi,
        CancelTransferIntentApi,
        GetTransferIntentApi,
        ExecuteTransferApi,
        GetTransferReceiptApi {
  private final CurrentCustomerProvider customer;
  private final RecipientQueryService recipients;
  private final TransferPreparationService preparation;
  private final TransferExecutionService execution;
  private final jakarta.servlet.http.HttpServletRequest request;

  public PaymentController(
      CurrentCustomerProvider customer,
      RecipientQueryService recipients,
      TransferPreparationService preparation,
      TransferExecutionService execution,
      jakarta.servlet.http.HttpServletRequest request) {
    this.customer = customer;
    this.recipients = recipients;
    this.preparation = preparation;
    this.execution = execution;
    this.request = request;
  }

  public ResponseEntity<RecipientsResponse> getRecipients(String search) {
    return ResponseEntity.ok(
        new RecipientsResponse(
            recipients.list(customer.current(), search).stream()
                .map(PaymentMapper::recipient)
                .toList()));
  }

  public ResponseEntity<TransferIntent> createTransferIntent(
      CreateTransferIntentRequest body, String key) {
    AccountId source;
    RecipientId recipient;
    try {
      source = new AccountId(body.getSourceAccountId());
    } catch (IllegalArgumentException e) {
      throw new PaymentFailure(PaymentFailure.Code.ACCOUNT_NOT_FOUND);
    }
    try {
      recipient = new RecipientId(body.getRecipientId());
    } catch (IllegalArgumentException e) {
      throw new PaymentFailure(PaymentFailure.Code.RECIPIENT_NOT_FOUND);
    }
    var command =
        new PrepareTransfer(
            source,
            recipient,
            Money.of(body.getAmount().getAmount(), body.getAmount().getCurrency().getValue()),
            body.getNote());
    return ResponseEntity.status(201)
        .body(
            PaymentMapper.intent(preparation.prepare(customer.current(), command, session(), key)));
  }

  public ResponseEntity<TransferIntent> getTransferIntent(String intentId) {
    return ResponseEntity.ok(PaymentMapper.intent(preparation.get(customer.current(), intentId)));
  }

  public ResponseEntity<TransferIntent> cancelTransferIntent(
      String intentId, CancelTransferIntentRequest body) {
    return ResponseEntity.ok(
        PaymentMapper.intent(
            preparation.cancel(
                customer.current(), intentId, session(), body.getReason().getValue())));
  }

  public ResponseEntity<TransferReceipt> executeTransfer(String key, ExecuteTransferRequest body) {
    return ResponseEntity.ok(
        PaymentMapper.receipt(
            execution.execute(
                customer.current(),
                body.getIntentId(),
                body.getIntentHash(),
                key,
                session(),
                body.getActionAuthorizationId(),
                org.slf4j.MDC.get("correlationId"))));
  }

  public ResponseEntity<TransferReceipt> getTransferReceipt(String transferId) {
    return ResponseEntity.ok(PaymentMapper.receipt(execution.get(customer.current(), transferId)));
  }

  private String session() {
    var session = request.getSession(false);
    if (session == null)
      throw new com.asterbank.banking.security.application.SecurityFailure("UNAUTHENTICATED", 401);
    return session.getId();
  }
}
