package com.asterbank.banking.customer.card.application;

import static com.asterbank.banking.customer.card.application.CreditLimitFailure.Code.*;

import com.asterbank.banking.customer.card.domain.*;
import com.asterbank.banking.customer.payment.application.IdGenerator;
import com.asterbank.banking.security.application.ActionAuthorizationService;
import com.asterbank.banking.security.domain.SecurityState.Binding;
import com.asterbank.banking.security.domain.VerificationAction;
import com.asterbank.banking.shared.domain.CustomerId;
import java.math.BigDecimal;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

public final class CreditLimitService {
  private static final BigDecimal POLICY_MAX = new BigDecimal("100000.00");
  private final CreditLimitStore store;
  private final CardStore cards;
  private final ActionAuthorizationService grants;
  private final IdGenerator ids;
  private final Clock clock;

  public CreditLimitService(
      CreditLimitStore store,
      CardStore cards,
      ActionAuthorizationService grants,
      IdGenerator ids,
      Clock clock) {
    this.store = store;
    this.cards = cards;
    this.grants = grants;
    this.ids = ids;
    this.clock = clock;
  }

  public CreditLimitIntent prepare(
      CustomerId owner, String session, String cardId, BigDecimal requested) {
    if (session == null
        || cardId == null
        || requested == null
        || requested.scale() > 2
        || requested.signum() <= 0
        || requested.compareTo(POLICY_MAX) > 0) throw new CreditLimitFailure(INVALID_REQUEST);
    return store.write(
        owner,
        () -> {
          var card =
              cards
                  .card(owner, cardId)
                  .orElseThrow(() -> new CardFailure(CardFailure.Code.CARD_NOT_FOUND));
          var current = store.currentLimit(owner, cardId);
          if (card.type() != Card.Type.CREDIT
              || card.state().status() != Card.Status.ACTIVE
              || current == null
              || requested.compareTo(current) <= 0)
            throw new CreditLimitFailure(CREDIT_LIMIT_NOT_ELIGIBLE);
          var at = clock.instant().truncatedTo(ChronoUnit.MICROS);
          var expiry = at.plusSeconds(900);
          var id = ids.next("credit_limit_intent");
          var intent =
              new CreditLimitIntent(
                  id,
                  owner,
                  session,
                  cardId,
                  current,
                  requested.setScale(2),
                  CreditLimitIntent.hash(
                      id, owner, session, cardId, current, requested, at, expiry),
                  CreditLimitIntent.Status.PREPARED,
                  at,
                  expiry);
          store.save(intent);
          return intent;
        });
  }

  public CreditLimitIntent cancel(CustomerId owner, String session, String id) {
    return store.write(
        owner,
        () -> {
          var intent =
              store
                  .intent(owner, id)
                  .orElseThrow(() -> new CreditLimitFailure(CREDIT_LIMIT_INTENT_NOT_FOUND));
          if (!Objects.equals(session, intent.sessionId())
              || intent.status() != CreditLimitIntent.Status.PREPARED
              || !clock.instant().isBefore(intent.expiresAt()))
            throw new CreditLimitFailure(CREDIT_LIMIT_INTENT_CANCELLED);
          store.transition(
              owner, id, CreditLimitIntent.Status.PREPARED, CreditLimitIntent.Status.CANCELLED);
          return new CreditLimitIntent(
              intent.id(),
              intent.customer(),
              intent.sessionId(),
              intent.cardId(),
              intent.currentLimit(),
              intent.requestedLimit(),
              intent.intentHash(),
              CreditLimitIntent.Status.CANCELLED,
              intent.createdAt(),
              intent.expiresAt());
        });
  }

  public CreditLimitApplication submit(
      CustomerId owner,
      String session,
      String id,
      String hash,
      String authorizationId,
      String key,
      String correlation) {
    if (key == null || !key.matches("[A-Za-z0-9_-]{1,128}") || hash == null)
      throw new CreditLimitFailure(INVALID_REQUEST);
    return store.write(
        owner,
        () -> {
          var intent =
              store
                  .intent(owner, id)
                  .orElseThrow(() -> new CreditLimitFailure(CREDIT_LIMIT_INTENT_NOT_FOUND));
          if (!Objects.equals(session, intent.sessionId())
              || !Objects.equals(hash, intent.intentHash())
              || !hash.equals(
                  CreditLimitIntent.hash(
                      id,
                      owner,
                      session,
                      intent.cardId(),
                      intent.currentLimit(),
                      intent.requestedLimit(),
                      intent.createdAt(),
                      intent.expiresAt()))) throw new CreditLimitFailure(CREDIT_LIMIT_NOT_ELIGIBLE);
          var prior = store.replay(owner, key);
          if (prior.isPresent()) {
            if (!prior.get().intentId().equals(id))
              throw new CreditLimitFailure(IDEMPOTENCY_KEY_REUSED);
            return prior.get();
          }
          if (intent.status() == CreditLimitIntent.Status.CANCELLED)
            throw new CreditLimitFailure(CREDIT_LIMIT_INTENT_CANCELLED);
          if (intent.status() != CreditLimitIntent.Status.PREPARED
              || !clock.instant().isBefore(intent.expiresAt()))
            throw new CreditLimitFailure(CREDIT_LIMIT_INTENT_EXPIRED);
          var card =
              cards
                  .card(owner, intent.cardId())
                  .orElseThrow(() -> new CardFailure(CardFailure.Code.CARD_NOT_FOUND));
          if (card.state().status() != Card.Status.ACTIVE
              || !intent.currentLimit().equals(store.currentLimit(owner, intent.cardId())))
            throw new CreditLimitFailure(CREDIT_LIMIT_NOT_ELIGIBLE);
          var binding = new Binding(owner.value(), session, "CREDIT_LIMIT_INTENT", id, hash);
          grants.require(
              authorizationId, binding, VerificationAction.CREDIT_LIMIT_APPLICATION_SUBMIT);
          var application =
              new CreditLimitApplication(
                  ids.next("credit_limit_application"),
                  owner,
                  intent.cardId(),
                  id,
                  intent.currentLimit(),
                  intent.requestedLimit(),
                  CreditLimitApplication.Status.UNDER_REVIEW,
                  clock.instant().truncatedTo(ChronoUnit.MICROS),
                  key);
          store.save(application);
          store.transition(
              owner, id, CreditLimitIntent.Status.PREPARED, CreditLimitIntent.Status.SUBMITTED);
          grants.consume(authorizationId, binding, correlation);
          return application;
        });
  }

  public List<CreditLimitApplication> list(CustomerId owner) {
    return store.list(owner);
  }

  public CreditLimitApplication detail(CustomerId owner, String id) {
    return store
        .detail(owner, id)
        .orElseThrow(() -> new CreditLimitFailure(CREDIT_LIMIT_APPLICATION_NOT_FOUND));
  }
}
