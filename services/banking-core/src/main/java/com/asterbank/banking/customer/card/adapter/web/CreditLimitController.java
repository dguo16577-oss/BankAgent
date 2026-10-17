package com.asterbank.banking.customer.card.adapter.web;

import com.asterbank.banking.customer.card.application.*;
import com.asterbank.banking.customer.card.domain.*;
import com.asterbank.banking.shared.security.CurrentCustomerProvider;
import com.asterbank.contract.customer.api.*;
import com.asterbank.contract.customer.model.*;
import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!unit")
public class CreditLimitController
    implements PrepareCreditLimitApplicationApi,
        CancelCreditLimitIntentApi,
        SubmitCreditLimitApplicationApi,
        ListCreditLimitApplicationsApi,
        GetCreditLimitApplicationApi {
  private final CreditLimitService service;
  private final CurrentCustomerProvider current;
  private final HttpServletRequest http;

  public CreditLimitController(
      CreditLimitService service, CurrentCustomerProvider current, HttpServletRequest http) {
    this.service = service;
    this.current = current;
    this.http = http;
  }

  private String session() {
    var s = http.getSession(false);
    if (s == null)
      throw new com.asterbank.banking.security.application.SecurityFailure("UNAUTHENTICATED", 401);
    return s.getId();
  }

  public ResponseEntity<com.asterbank.contract.customer.model.CreditLimitIntent>
      prepareCreditLimitApplication(PrepareCreditLimitRequest body) {
    return ResponseEntity.status(201)
        .body(
            intent(
                service.prepare(
                    current.current(),
                    session(),
                    body.getCardId(),
                    decimal(body.getRequestedLimit()))));
  }

  public ResponseEntity<com.asterbank.contract.customer.model.CreditLimitIntent>
      cancelCreditLimitIntent(String intentId) {
    return ResponseEntity.ok(intent(service.cancel(current.current(), session(), intentId)));
  }

  public ResponseEntity<com.asterbank.contract.customer.model.CreditLimitApplication>
      submitCreditLimitApplication(String key, SubmitCreditLimitRequest body) {
    return ResponseEntity.status(201)
        .body(
            application(
                service.submit(
                    current.current(),
                    session(),
                    body.getIntentId(),
                    body.getIntentHash(),
                    body.getActionAuthorizationId(),
                    key,
                    org.slf4j.MDC.get("correlationId"))));
  }

  public ResponseEntity<CreditLimitApplicationsResponse> listCreditLimitApplications() {
    return ResponseEntity.ok(
        new CreditLimitApplicationsResponse(
            service.list(current.current()).stream()
                .map(CreditLimitController::application)
                .toList()));
  }

  public ResponseEntity<com.asterbank.contract.customer.model.CreditLimitApplication>
      getCreditLimitApplication(String applicationId) {
    return ResponseEntity.ok(application(service.detail(current.current(), applicationId)));
  }

  private static BigDecimal decimal(String value) {
    try {
      return new BigDecimal(value);
    } catch (RuntimeException e) {
      throw new CreditLimitFailure(CreditLimitFailure.Code.INVALID_REQUEST);
    }
  }

  private static com.asterbank.contract.customer.model.CreditLimitIntent intent(
      com.asterbank.banking.customer.card.domain.CreditLimitIntent i) {
    return new com.asterbank.contract.customer.model.CreditLimitIntent()
        .id(i.id())
        .cardId(i.cardId())
        .currentLimit(i.currentLimit().toPlainString())
        .requestedLimit(i.requestedLimit().toPlainString())
        .intentHash(i.intentHash())
        .status(
            com.asterbank.contract.customer.model.CreditLimitIntent.StatusEnum.fromValue(
                i.status().name()))
        .verificationRequirement(VerificationRequirement.PASSWORD_AND_SMS_OTP)
        .expiresAt(i.expiresAt().toString());
  }

  private static com.asterbank.contract.customer.model.CreditLimitApplication application(
      com.asterbank.banking.customer.card.domain.CreditLimitApplication a) {
    return new com.asterbank.contract.customer.model.CreditLimitApplication()
        .id(a.id())
        .cardId(a.cardId())
        .currentLimit(a.currentLimit().toPlainString())
        .requestedLimit(a.requestedLimit().toPlainString())
        .status(
            com.asterbank.contract.customer.model.CreditLimitApplication.StatusEnum.fromValue(
                a.status().name()))
        .submittedAt(a.submittedAt().toString());
  }
}
