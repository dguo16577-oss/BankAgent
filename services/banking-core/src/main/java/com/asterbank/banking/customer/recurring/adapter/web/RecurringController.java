package com.asterbank.banking.customer.recurring.adapter.web;

import com.asterbank.banking.customer.recurring.application.RecurringService;
import com.asterbank.banking.customer.recurring.domain.RecurringFailure;
import com.asterbank.banking.shared.security.CurrentCustomerProvider;
import com.asterbank.contract.customer.api.*;
import com.asterbank.contract.customer.model.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!unit")
public class RecurringController
    implements ListRecurringPaymentsApi,
        GetRecurringPaymentApi,
        PrepareRecurringPaymentActionApi,
        GetRecurringPaymentActionIntentApi,
        CancelRecurringPaymentActionIntentApi,
        ExecuteRecurringPaymentActionApi,
        GetRecurringPaymentActionReceiptApi {
  private final RecurringService service;
  private final CurrentCustomerProvider customer;
  private final HttpServletRequest request;

  public RecurringController(
      RecurringService service, CurrentCustomerProvider customer, HttpServletRequest request) {
    this.service = service;
    this.customer = customer;
    this.request = request;
  }

  private void query() {
    if (!request.getParameterMap().isEmpty())
      throw new RecurringFailure(RecurringFailure.Code.INVALID_REQUEST);
  }

  public ResponseEntity<RecurringPaymentsResponse> listRecurringPayments() {
    query();
    return ResponseEntity.ok(
        new RecurringPaymentsResponse(
            service.list(customer.current()).stream().map(RecurringMapper::summary).toList()));
  }

  public ResponseEntity<RecurringPaymentDetail> getRecurringPayment(String id) {
    query();
    return ResponseEntity.ok(RecurringMapper.detail(service.detail(customer.current(), id)));
  }

  public ResponseEntity<RecurringPaymentActionIntent> prepareRecurringPaymentAction(
      CreateRecurringPaymentActionIntentRequest r) {
    query();
    if (r.getActionType() != RecurringPaymentActionType.STOP_FUTURE_PAYMENTS)
      throw new RecurringFailure(RecurringFailure.Code.INVALID_REQUEST);
    return ResponseEntity.status(201)
        .body(
            RecurringMapper.intent(service.prepare(customer.current(), r.getRecurringPaymentId())));
  }

  public ResponseEntity<RecurringPaymentActionIntent> getRecurringPaymentActionIntent(String id) {
    query();
    return ResponseEntity.ok(RecurringMapper.intent(service.intent(customer.current(), id)));
  }

  public ResponseEntity<RecurringPaymentActionIntent> cancelRecurringPaymentActionIntent(
      String id) {
    query();
    return ResponseEntity.ok(RecurringMapper.intent(service.cancel(customer.current(), id)));
  }

  public ResponseEntity<RecurringPaymentActionReceipt> executeRecurringPaymentAction(
      String key, ExecuteRecurringPaymentActionRequest r) {
    query();
    return ResponseEntity.ok(
        RecurringMapper.action(
            service.execute(
                customer.current(),
                r.getIntentId(),
                r.getIntentHash(),
                key,
                request.getSession(false).getId(),
                r.getActionAuthorizationId(),
                org.slf4j.MDC.get("correlationId"))));
  }

  public ResponseEntity<RecurringPaymentActionReceipt> getRecurringPaymentActionReceipt(String id) {
    query();
    return ResponseEntity.ok(RecurringMapper.action(service.action(customer.current(), id)));
  }
}
