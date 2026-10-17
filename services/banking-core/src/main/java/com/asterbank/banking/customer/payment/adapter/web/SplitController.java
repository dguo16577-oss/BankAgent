package com.asterbank.banking.customer.payment.adapter.web;

import com.asterbank.banking.customer.account.application.AccountRepository;
import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.payment.domain.RecipientId;
import com.asterbank.banking.shared.domain.CustomerId;
import com.asterbank.banking.shared.domain.Money;
import com.asterbank.banking.shared.security.CurrentCustomerProvider;
import com.asterbank.banking.shared.web.ReadModelMapper;
import com.asterbank.contract.customer.api.*;
import com.asterbank.contract.customer.model.*;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.time.OffsetDateTime;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!unit")
public class SplitController
    implements ListSplitBillsApi,
        GetSplitBillApi,
        PrepareSplitActionApi,
        GetSplitActionIntentApi,
        CancelSplitActionIntentApi,
        ExecuteSplitActionApi {
  private final SplitRequestService service;
  private final CurrentCustomerProvider customer;
  private final AccountRepository accounts;
  private final RecipientRepository recipients;
  private final HttpServletRequest request;
  private final Clock clock;

  public SplitController(
      SplitRequestService service,
      CurrentCustomerProvider customer,
      AccountRepository accounts,
      RecipientRepository recipients,
      HttpServletRequest request,
      Clock clock) {
    this.service = service;
    this.customer = customer;
    this.accounts = accounts;
    this.recipients = recipients;
    this.request = request;
    this.clock = clock;
  }

  private String session() {
    var s = request.getSession(false);
    if (s == null)
      throw new com.asterbank.banking.security.application.SecurityFailure("UNAUTHENTICATED", 401);
    return s.getId();
  }

  public ResponseEntity<SplitBillsResponse> listSplitBills(String role) {
    session();
    if (role != null && !role.equals("OWNER") && !role.equals("PARTICIPANT"))
      throw new PaymentFailure(PaymentFailure.Code.INVALID_QUERY);
    boolean participant = "PARTICIPANT".equals(role);
    var caller = customer.current();
    return ResponseEntity.ok(
        new SplitBillsResponse()
            .items(
                service.list(caller, participant).stream()
                    .map(b -> map(b, caller, participant))
                    .toList()));
  }

  public ResponseEntity<SplitBill> getSplitBill(String splitId) {
    session();
    var caller = customer.current();
    try {
      return ResponseEntity.ok(map(service.get(caller, splitId, false), caller, false));
    } catch (PaymentFailure e) {
      if (e.code() != PaymentFailure.Code.SPLIT_NOT_FOUND) throw e;
      return ResponseEntity.ok(map(service.get(caller, splitId, true), caller, true));
    }
  }

  public ResponseEntity<SplitActionIntent> prepareSplitAction(PrepareSplitActionRequest body) {
    var owner = customer.current();
    var sid = session();
    try {
      if (body.getActionType() == PrepareSplitActionRequest.ActionTypeEnum.CREATE) {
        if (body.getReceiveAccountId() == null
            || body.getTotalAmount() == null
            || body.getPayerShare() == null
            || body.getParticipants() == null
            || body.getParticipants().isEmpty()
            || body.getSplitId() != null
            || body.getExpectedVersion() != null) throw new IllegalArgumentException();
        var shares =
            body.getParticipants().stream()
                .map(
                    s ->
                        new SplitRequestService.Share(
                            new RecipientId(s.getRecipientId()), money(s.getAmountDue())))
                .toList();
        return ResponseEntity.ok(
            map(
                service.prepareCreate(
                    owner,
                    sid,
                    new AccountId(body.getReceiveAccountId()),
                    money(body.getTotalAmount()),
                    money(body.getPayerShare()),
                    shares,
                    body.getNote()),
                owner));
      }
      if (body.getActionType() == PrepareSplitActionRequest.ActionTypeEnum.CANCEL
          && body.getSplitId() != null
          && body.getExpectedVersion() != null
          && body.getReceiveAccountId() == null
          && (body.getParticipants() == null || body.getParticipants().isEmpty()))
        return ResponseEntity.ok(
            map(
                service.prepareCancel(owner, sid, body.getSplitId(), body.getExpectedVersion()),
                owner));
      throw new IllegalArgumentException();
    } catch (IllegalArgumentException | NullPointerException e) {
      throw new PaymentFailure(PaymentFailure.Code.INVALID_REQUEST);
    }
  }

  public ResponseEntity<SplitActionIntent> getSplitActionIntent(String intentId) {
    return ResponseEntity.ok(
        map(service.intent(customer.current(), session(), intentId), customer.current()));
  }

  public ResponseEntity<SplitActionIntent> cancelSplitActionIntent(
      String intentId, CancelTransferIntentRequest body) {
    return ResponseEntity.ok(
        map(
            service.cancelIntent(
                customer.current(), session(), intentId, body.getReason().getValue()),
            customer.current()));
  }

  public ResponseEntity<SplitBill> executeSplitAction(String key, ExecuteSplitActionRequest body) {
    var owner = customer.current();
    return ResponseEntity.ok(
        map(
            service.confirm(
                owner,
                session(),
                body.getIntentId(),
                body.getIntentHash(),
                key,
                body.getActionAuthorizationId(),
                request.getHeader("X-Correlation-Id")),
            owner,
            false));
  }

  private static Money money(com.asterbank.contract.customer.model.Money m) {
    return Money.of(m.getAmount(), m.getCurrency().getValue());
  }

  private SplitActionIntent map(
      com.asterbank.banking.customer.payment.domain.SplitActionIntent intent, CustomerId owner) {
    return new SplitActionIntent()
        .id(intent.id())
        .actionType(SplitActionIntent.ActionTypeEnum.fromValue(intent.actionType().name()))
        .split(map(intent.reviewedBill(), owner, false))
        .intentHash(intent.intentHash())
        .status(TransferIntentStatus.fromValue(intent.statusAt(OffsetDateTime.now(clock)).name()))
        .createdAt(ReadModelMapper.time(intent.createdAt()))
        .expiresAt(ReadModelMapper.time(intent.expiresAt()))
        .verificationRequirement(
            intent.actionType()
                    == com.asterbank.banking.customer.payment.domain.SplitActionIntent.Type.CREATE
                ? VerificationRequirement.SMS_OTP
                : VerificationRequirement.PASSWORD);
  }

  private SplitBill map(
      com.asterbank.banking.customer.payment.domain.SplitBill bill,
      CustomerId viewer,
      boolean participant) {
    var account =
        accounts
            .find(bill.ownerCustomerId(), bill.receivingAccountId())
            .orElseThrow(() -> new PaymentFailure(PaymentFailure.Code.ACCOUNT_NOT_FOUND));
    var shares =
        bill.participants().stream()
            .filter(p -> !participant || p.targetCustomerId().equals(viewer))
            .map(
                p -> {
                  var recipient =
                      recipients
                          .find(bill.ownerCustomerId(), p.recipientId())
                          .orElseThrow(
                              () -> new PaymentFailure(PaymentFailure.Code.RECIPIENT_NOT_FOUND));
                  return new com.asterbank.contract.customer.model.SplitParticipant()
                      .id(p.id())
                      .recipientId(p.recipientId().value())
                      .displayName(recipient.displayName())
                      .maskedAccountNumber(recipient.maskedAccountNumber())
                      .amountDue(ReadModelMapper.money(p.amountDue()))
                      .status(
                          com.asterbank.contract.customer.model.SplitParticipant.StatusEnum
                              .fromValue(p.status().name()));
                })
            .toList();
    return new SplitBill()
        .id(bill.id())
        .role(participant ? SplitBill.RoleEnum.PARTICIPANT : SplitBill.RoleEnum.OWNER)
        .receivingAccount(
            new SplitReceivingAccount()
                .id(account.id().value())
                .displayName(account.displayName())
                .maskedAccountNumber(account.maskedAccountNumber()))
        .totalAmount(ReadModelMapper.money(bill.total()))
        .payerShare(ReadModelMapper.money(bill.payerShare()))
        .participants(shares)
        .note(bill.note())
        .status(SplitBill.StatusEnum.fromValue(bill.status().name()))
        .version(bill.version())
        .createdAt(ReadModelMapper.time(bill.createdAt()))
        .expiresAt(ReadModelMapper.time(bill.expiresAt()))
        .cancelledAt(bill.cancelledAt() == null ? null : ReadModelMapper.time(bill.cancelledAt()));
  }
}
