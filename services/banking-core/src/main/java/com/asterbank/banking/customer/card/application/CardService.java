package com.asterbank.banking.customer.card.application;

import static com.asterbank.banking.customer.card.application.CardFailure.Code.*;

import com.asterbank.banking.customer.card.domain.*;
import com.asterbank.banking.customer.payment.application.IdGenerator;
import com.asterbank.banking.customer.payment.application.IdempotencyRepository;
import com.asterbank.banking.security.application.*;
import com.asterbank.banking.security.domain.SecurityState.Binding;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

public final class CardService {
  private final CardStore store;
  private final IdempotencyRepository keys;
  private final ActionAuthorizationService authorizations;
  private final IdGenerator ids;
  private final Clock clock;
  private final CardExecutionCheckpoint checkpoint;
  private final CardIntentHasher hasher = new CardIntentHasher();

  public CardService(
      CardStore store,
      IdempotencyRepository keys,
      ActionAuthorizationService authorizations,
      IdGenerator ids,
      Clock clock,
      CardExecutionCheckpoint checkpoint) {
    this.store = store;
    this.keys = keys;
    this.authorizations = authorizations;
    this.ids = ids;
    this.clock = clock;
    this.checkpoint = checkpoint;
  }

  private OffsetDateTime now() {
    return OffsetDateTime.now(clock).truncatedTo(ChronoUnit.MICROS);
  }

  public List<Card> list(CustomerId owner) {
    return store.cards(owner);
  }

  public Card card(CustomerId owner, String id) {
    return store.card(owner, id).orElseThrow(() -> new CardFailure(CARD_NOT_FOUND));
  }

  public CardActionIntent prepare(
      CustomerId owner, String id, CardActionType type, CardControls controls) {
    return prepare(owner, id, type, controls, null);
  }

  public CardActionIntent prepare(
      CustomerId owner, String id, CardActionType type, CardControls controls, CardLimits limits) {
    return store.write(
        () -> {
          var card = card(owner, id);
          var change = card.plan(type, controls, limits);
          var at = now();
          var terms =
              new CardIntentTerms(
                  ids.next("card_intent"), card, type, change, at, at.plusMinutes(15));
          var intent =
              new CardActionIntent(terms, hasher.hash(terms), CardActionIntent.Status.PREPARED);
          store.save(intent);
          return intent;
        });
  }

  public CardActionIntent intent(CustomerId owner, String id) {
    var i = storedIntent(owner, id);
    return new CardActionIntent(i.terms(), i.intentHash(), i.statusAt(clock.instant()));
  }

  private CardActionIntent storedIntent(CustomerId owner, String id) {
    return store.intent(owner, id).orElseThrow(() -> new CardFailure(CARD_ACTION_INTENT_NOT_FOUND));
  }

  public CardActionIntent cancel(CustomerId owner, String id) {
    return store.write(
        () -> {
          var intent = storedIntent(owner, id);
          if (intent.statusAt(clock.instant()) == CardActionIntent.Status.EXPIRED)
            throw new CardFailure(CARD_ACTION_INTENT_EXPIRED);
          if (intent.status() != CardActionIntent.Status.PREPARED)
            throw new CardFailure(
                intent.status() == CardActionIntent.Status.CANCELLED
                    ? CARD_ACTION_INTENT_CANCELLED
                    : CARD_ACTION_INTENT_ALREADY_EXECUTED);
          var cancelled = intent.cancelled();
          store.save(cancelled);
          return cancelled;
        });
  }

  public CardAction action(CustomerId owner, String id) {
    return store.action(owner, id).orElseThrow(() -> new CardFailure(CARD_ACTION_NOT_FOUND));
  }

  public static com.asterbank.banking.security.domain.VerificationAction verificationAction(
      CardIntentTerms t) {
    return switch (t.actionType()) {
      case FREEZE -> com.asterbank.banking.security.domain.VerificationAction.CARD_FREEZE;
      case REPORT_LOST ->
          com.asterbank.banking.security.domain.VerificationAction.CARD_CONTROL_PROTECTIVE;
      case UNFREEZE -> com.asterbank.banking.security.domain.VerificationAction.CARD_UNFREEZE;
      case UPDATE_CONTROLS ->
          t.change().risk() == RiskDirection.RISK_INCREASING
              ? com.asterbank.banking.security.domain.VerificationAction
                  .CARD_CONTROL_RISK_INCREASING
              : com.asterbank.banking.security.domain.VerificationAction.CARD_CONTROL_PROTECTIVE;
      case UPDATE_LIMITS ->
          t.change().risk() == RiskDirection.RISK_INCREASING
              ? com.asterbank.banking.security.domain.VerificationAction
                  .CARD_CONTROL_RISK_INCREASING
              : com.asterbank.banking.security.domain.VerificationAction.CARD_CONTROL_PROTECTIVE;
    };
  }

  public CardAction execute(
      CustomerId owner,
      String sessionId,
      String intentId,
      String hash,
      String authorizationId,
      String key,
      String correlation) {
    if (intentId == null || hash == null || key == null || !key.matches("[A-Za-z0-9_-]{1,128}"))
      throw new CardFailure(INVALID_REQUEST);
    return store.write(
        () -> {
          var scope = new IdempotencyRepository.Scope(owner, "EXECUTE_CARD_ACTION", key);
          var fingerprint = hasher.fingerprint(intentId, hash, authorizationId);
          var previous = keys.find(scope);
          if (previous.isPresent()) {
            var p = previous.get();
            if (!p.fingerprint().equals(fingerprint)) throw new CardFailure(IDEMPOTENCY_KEY_REUSED);
            return action(owner, p.resourceId());
          }
          var intent = storedIntent(owner, intentId);
          var binding = new Binding(owner.value(), sessionId, "CARD_ACTION_INTENT", intentId, hash);
          // Preserve frozen M8 ordering for explicitly supplied authorizations, after successful
          // replay.
          if (authorizationId != null && !authorizationId.isEmpty())
            authorizations.validate(authorizationId, binding);
          if (!intent.intentHash().equals(hash) || !hasher.hash(intent.terms()).equals(hash))
            throw new CardFailure(CARD_ACTION_INTENT_HASH_MISMATCH);
          if (intent.status() == CardActionIntent.Status.EXECUTED)
            throw new CardFailure(CARD_ACTION_INTENT_ALREADY_EXECUTED);
          if (intent.status() == CardActionIntent.Status.CANCELLED)
            throw new CardFailure(CARD_ACTION_INTENT_CANCELLED);
          if (intent.statusAt(clock.instant()) == CardActionIntent.Status.EXPIRED)
            throw new CardFailure(CARD_ACTION_INTENT_EXPIRED);
          var t = intent.terms();
          var current = card(owner, t.card().id());
          if (!current.equals(t.card())) throw new CardFailure(CARD_STATE_CHANGED);
          var at = now();
          var changed = current.apply(t.actionType(), t.change(), at);
          authorizations.require(authorizationId, binding, verificationAction(t));
          store.save(changed);
          checkpoint.reached(CardExecutionCheckpoint.Stage.AFTER_CARD_MUTATION);
          var actionId = ids.next("card_action");
          var receipt = new CardAction(actionId, t, changed, "ASTER-CARD-" + actionId, at);
          checkpoint.reached(CardExecutionCheckpoint.Stage.BEFORE_ACTION_PERSISTENCE);
          store.save(receipt);
          store.save(intent.executed());
          if (authorizationId != null && !authorizationId.isEmpty()) {
            checkpoint.reached(CardExecutionCheckpoint.Stage.BEFORE_AUTHORIZATION_CONSUMPTION);
            authorizations.consume(authorizationId, binding, correlation);
            checkpoint.reached(CardExecutionCheckpoint.Stage.AFTER_AUTHORIZATION_CONSUMPTION);
          }
          keys.save(new IdempotencyRepository.Completed(scope, fingerprint, actionId));
          return receipt;
        });
  }
}
