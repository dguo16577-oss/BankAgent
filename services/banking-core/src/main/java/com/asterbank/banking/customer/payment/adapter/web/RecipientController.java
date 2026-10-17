package com.asterbank.banking.customer.payment.adapter.web;

import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.payment.domain.RecipientAction;
import com.asterbank.banking.shared.security.CurrentCustomerProvider;
import com.asterbank.banking.shared.web.ReadModelMapper;
import com.asterbank.contract.customer.api.*;
import com.asterbank.contract.customer.model.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!unit")
public class RecipientController
    implements GetRecipientApi,
        PrepareRecipientActionApi,
        GetRecipientActionIntentApi,
        CreateRecipientApi,
        DeactivateRecipientApi {
  private final RecipientManagementService service;
  private final CurrentCustomerProvider owner;
  private final HttpServletRequest request;

  public RecipientController(
      RecipientManagementService service,
      CurrentCustomerProvider owner,
      HttpServletRequest request) {
    this.service = service;
    this.owner = owner;
    this.request = request;
  }

  private String session() {
    if (!request.getParameterMap().isEmpty())
      throw new PaymentFailure(PaymentFailure.Code.INVALID_QUERY);
    var s = request.getSession(false);
    if (s == null)
      throw new com.asterbank.banking.security.application.SecurityFailure("UNAUTHENTICATED", 401);
    return s.getId();
  }

  public ResponseEntity<RecipientSummary> getRecipient(String id) {
    session();
    return ResponseEntity.ok(PaymentMapper.recipient(service.get(owner.current(), id)));
  }

  public ResponseEntity<RecipientActionIntent> prepareRecipientAction(
      PrepareRecipientActionRequest body) {
    return ResponseEntity.ok(
        map(
            service.prepare(
                owner.current(),
                session(),
                RecipientAction.Type.valueOf(body.getActionType().getValue()),
                body.getDestinationRef(),
                body.getRecipientId())));
  }

  public ResponseEntity<RecipientActionIntent> getRecipientActionIntent(String id) {
    return ResponseEntity.ok(map(service.intent(owner.current(), session(), id)));
  }

  public ResponseEntity<RecipientSummary> createRecipient(
      String key, ExecuteRecipientActionRequest body) {
    return execute(key, body, RecipientAction.Type.CREATE);
  }

  public ResponseEntity<RecipientSummary> deactivateRecipient(
      String key, ExecuteRecipientActionRequest body) {
    return execute(key, body, RecipientAction.Type.DEACTIVATE);
  }

  private ResponseEntity<RecipientSummary> execute(
      String key, ExecuteRecipientActionRequest body, RecipientAction.Type type) {
    return ResponseEntity.ok(
        PaymentMapper.recipient(
            service.execute(
                owner.current(),
                session(),
                body.getIntentId(),
                body.getIntentHash(),
                key,
                type,
                body.getActionAuthorizationId(),
                org.slf4j.MDC.get("correlationId"))));
  }

  private RecipientActionIntent map(RecipientAction a) {
    return new RecipientActionIntent()
        .id(a.id())
        .verificationRequirement(
            a.type() == RecipientAction.Type.CREATE
                ? VerificationRequirement.PASSWORD_AND_SMS_OTP
                : VerificationRequirement.PASSWORD)
        .actionType(RecipientActionType.fromValue(a.type().name()))
        .recipient(PaymentMapper.recipient(a.recipient()))
        .intentHash(a.hash())
        .createdAt(ReadModelMapper.time(a.createdAt()))
        .expiresAt(ReadModelMapper.time(a.expiresAt()))
        .status(TransferIntentStatus.fromValue(service.status(a)))
        .authorizationRequirement(RecipientActionIntent.AuthorizationRequirementEnum.CONFIRMATION);
  }
}
