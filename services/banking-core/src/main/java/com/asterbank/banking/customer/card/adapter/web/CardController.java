package com.asterbank.banking.customer.card.adapter.web;

import com.asterbank.banking.customer.card.application.*;
import com.asterbank.banking.shared.security.CurrentCustomerProvider;
import com.asterbank.contract.customer.api.*;
import com.asterbank.contract.customer.model.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!unit")
public class CardController
    implements GetCardsApi,
        GetCardDetailApi,
        PrepareCardActionApi,
        GetCardActionIntentApi,
        CancelCardActionIntentApi,
        AuthorizeCardTransactionApi,
        ExecuteCardActionApi,
        GetCardActionReceiptApi {
  private final CardService service;
  private final CardAuthorizationService authorization;
  private final CurrentCustomerProvider customer;
  private final HttpServletRequest request;

  public CardController(
      CardService service,
      CardAuthorizationService authorization,
      CurrentCustomerProvider customer,
      HttpServletRequest request) {
    this.service = service;
    this.authorization = authorization;
    this.customer = customer;
    this.request = request;
  }

  private void query() {
    if (!request.getParameterMap().isEmpty())
      throw new CardFailure(CardFailure.Code.INVALID_REQUEST);
  }

  public ResponseEntity<CardsResponse> getCards() {
    query();
    return ResponseEntity.ok(
        new CardsResponse(
            service.list(customer.current()).stream().map(CardMapper::summary).toList()));
  }

  public ResponseEntity<CardDetail> getCardDetail(String id) {
    query();
    return ResponseEntity.ok(CardMapper.detail(service.card(customer.current(), id)));
  }

  public ResponseEntity<CardActionIntent> prepareCardAction(CreateCardActionIntentRequest body) {
    query();
    String id;
    com.asterbank.banking.customer.card.domain.CardActionType type;
    com.asterbank.banking.customer.card.domain.CardControls controls = null;
    com.asterbank.banking.customer.card.domain.CardLimits limits = null;
    if (body instanceof CreateCardActionIntentRequestOneOf r) {
      id = r.getCardId();
      type =
          com.asterbank.banking.customer.card.domain.CardActionType.valueOf(
              r.getActionType().getValue());
    } else if (body instanceof CreateCardActionIntentRequestOneOf1 r) {
      id = r.getCardId();
      type = com.asterbank.banking.customer.card.domain.CardActionType.UPDATE_CONTROLS;
      var c = r.getControls();
      controls =
          new com.asterbank.banking.customer.card.domain.CardControls(
              c.getOnlinePayments(),
              c.getInternationalPayments(),
              c.getAtmWithdrawals(),
              c.getContactless());
    } else if (body instanceof CreateCardActionIntentRequestOneOf2 r) {
      id = r.getCardId();
      type = com.asterbank.banking.customer.card.domain.CardActionType.UPDATE_LIMITS;
      var l = r.getLimits();
      var current = service.card(customer.current(), id).state().limits();
      try {
        limits =
            current.withCustomerLimits(
                new java.math.BigDecimal(l.getPerTransaction()),
                new java.math.BigDecimal(l.getDaily()));
      } catch (NumberFormatException e) {
        throw new CardFailure(CardFailure.Code.INVALID_REQUEST);
      }
    } else throw new CardFailure(CardFailure.Code.INVALID_REQUEST);
    return ResponseEntity.status(201)
        .body(CardMapper.intent(service.prepare(customer.current(), id, type, controls, limits)));
  }

  public ResponseEntity<CardActionIntent> getCardActionIntent(String id) {
    query();
    return ResponseEntity.ok(CardMapper.intent(service.intent(customer.current(), id)));
  }

  public ResponseEntity<CardActionIntent> cancelCardActionIntent(String intentId) {
    query();
    return ResponseEntity.ok(CardMapper.intent(service.cancel(customer.current(), intentId)));
  }

  public ResponseEntity<CardActionReceipt> executeCardAction(
      String key, ExecuteCardActionRequest body) {
    query();
    var session = request.getSession(false);
    if (session == null)
      throw new com.asterbank.banking.security.application.SecurityFailure("UNAUTHENTICATED", 401);
    return ResponseEntity.ok(
        CardMapper.receipt(
            service.execute(
                customer.current(),
                session.getId(),
                body.getIntentId(),
                body.getIntentHash(),
                body.getActionAuthorizationId(),
                key,
                org.slf4j.MDC.get("correlationId"))));
  }

  public ResponseEntity<CardActionReceipt> getCardActionReceipt(String id) {
    query();
    return ResponseEntity.ok(CardMapper.receipt(service.action(customer.current(), id)));
  }

  public ResponseEntity<CardAuthorizationDecision> authorizeCardTransaction(
      String key, CardAuthorizationRequest body) {
    query();
    java.math.BigDecimal amount;
    try {
      amount = new java.math.BigDecimal(body.getAmount());
    } catch (RuntimeException e) {
      throw new CardFailure(CardFailure.Code.INVALID_REQUEST);
    }
    var decision =
        authorization.authorize(
            customer.current(),
            body.getCardId(),
            amount,
            com.asterbank.banking.customer.card.domain.CardAuthorization.Channel.valueOf(
                body.getChannel().getValue()),
            Boolean.TRUE.equals(body.getInternational()),
            key);
    return ResponseEntity.ok(
        new CardAuthorizationDecision(
            decision.id(),
            decision.cardId(),
            decision.amount().toPlainString(),
            CardAuthorizationDecision.CurrencyEnum.CNY,
            CardAuthorizationDecision.ChannelEnum.fromValue(decision.channel().name()),
            decision.international(),
            CardAuthorizationDecision.StatusEnum.fromValue(decision.status().name()),
            CardAuthorizationDecision.ReasonEnum.fromValue(decision.reason().name()),
            decision.authorizedAt().toString()));
  }
}
