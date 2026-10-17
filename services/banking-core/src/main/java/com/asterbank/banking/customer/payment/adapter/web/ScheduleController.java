package com.asterbank.banking.customer.payment.adapter.web;

import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.payment.domain.RecipientId;
import com.asterbank.banking.customer.payment.domain.ScheduleAction;
import com.asterbank.banking.shared.domain.Money;
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
public class ScheduleController
    implements ListScheduledPaymentsApi,
        GetScheduledPaymentApi,
        PrepareScheduleActionApi,
        GetScheduleActionIntentApi,
        CancelScheduleActionIntentApi,
        ExecuteScheduleActionApi {
  private final ScheduledPaymentService service;
  private final CurrentCustomerProvider owner;
  private final HttpServletRequest request;

  public ScheduleController(
      ScheduledPaymentService service, CurrentCustomerProvider owner, HttpServletRequest request) {
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

  public ResponseEntity<ScheduledPaymentsResponse> listScheduledPayments() {
    session();
    return ResponseEntity.ok(
        new ScheduledPaymentsResponse()
            .items(service.list(owner.current()).stream().map(ScheduleController::map).toList()));
  }

  public ResponseEntity<ScheduledPayment> getScheduledPayment(String id) {
    session();
    return ResponseEntity.ok(map(service.get(owner.current(), id)));
  }

  public ResponseEntity<ScheduleActionIntent> prepareScheduleAction(
      PrepareScheduleActionRequest b) {
    var type = ScheduleAction.Type.valueOf(b.getActionType().getValue());
    PrepareTransfer terms = null;
    if (type != ScheduleAction.Type.CANCEL) {
      try {
        terms =
            new PrepareTransfer(
                new AccountId(b.getSourceAccountId()),
                new RecipientId(b.getRecipientId()),
                Money.of(b.getAmount().getAmount(), b.getAmount().getCurrency().getValue()),
                b.getNote());
      } catch (IllegalArgumentException | NullPointerException e) {
        throw new PaymentFailure(PaymentFailure.Code.INVALID_REQUEST);
      }
    }
    return ResponseEntity.ok(
        map(
            service.prepare(
                owner.current(),
                session(),
                type,
                b.getScheduleId(),
                b.getExpectedVersion(),
                terms,
                b.getDueAt() == null ? null : java.time.OffsetDateTime.parse(b.getDueAt()))));
  }

  public ResponseEntity<ScheduleActionIntent> getScheduleActionIntent(String id) {
    return ResponseEntity.ok(map(service.intent(owner.current(), session(), id)));
  }

  public ResponseEntity<ScheduleActionIntent> cancelScheduleActionIntent(
      String intentId, CancelTransferIntentRequest body) {
    return ResponseEntity.ok(
        map(
            service.cancelIntent(
                owner.current(), session(), intentId, body.getReason().getValue())));
  }

  public ResponseEntity<ScheduledPayment> executeScheduleAction(
      String key, ExecuteScheduleActionRequest b) {
    return ResponseEntity.ok(
        map(
            service.confirm(
                owner.current(),
                session(),
                b.getIntentId(),
                b.getIntentHash(),
                key,
                b.getActionAuthorizationId(),
                request.getHeader("X-Correlation-Id"))));
  }

  private ScheduleActionIntent map(ScheduleAction a) {
    return new ScheduleActionIntent()
        .id(a.id())
        .verificationRequirement(
            a.actionType() == ScheduleAction.Type.CANCEL
                ? VerificationRequirement.PASSWORD
                : VerificationRequirement.SMS_OTP)
        .actionType(ScheduleActionType.fromValue(a.actionType().name()))
        .schedule(map(a.proposed()))
        .intentHash(a.intentHash())
        .createdAt(ReadModelMapper.time(a.createdAt()))
        .expiresAt(ReadModelMapper.time(a.expiresAt()))
        .status(TransferIntentStatus.fromValue(service.status(a)))
        .authorizationRequirement(ScheduleActionIntent.AuthorizationRequirementEnum.CONFIRMATION)
        .policyVersion(ScheduledPaymentService.POLICY);
  }

  public static ScheduledPayment map(
      com.asterbank.banking.customer.payment.domain.ScheduledPayment p) {
    return new ScheduledPayment()
        .id(p.id())
        .sourceAccount(ReadModelMapper.account(p.terms().sourceAccount()))
        .recipient(PaymentMapper.recipient(p.terms().recipient()))
        .amount(ReadModelMapper.money(p.terms().amount()))
        .fee(ReadModelMapper.money(p.terms().fee()))
        .totalDebit(ReadModelMapper.money(p.terms().totalDebit()))
        .dueAt(ReadModelMapper.time(p.dueAt()))
        .status(ScheduledPaymentStatus.fromValue(p.status().name()))
        .version(p.version())
        .createdAt(ReadModelMapper.time(p.createdAt()))
        .updatedAt(ReadModelMapper.time(p.updatedAt()))
        .note(p.terms().note())
        .transferId(p.transferId())
        .transactionId(p.transactionId())
        .executedAt(p.executedAt() == null ? null : ReadModelMapper.time(p.executedAt()))
        .failureReason(p.failureReason());
  }
}
