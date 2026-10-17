package com.asterbank.banking.customer.payment.application;

import static com.asterbank.banking.customer.payment.application.PaymentFailure.Code.*;

import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.security.application.*;
import com.asterbank.banking.security.domain.*;
import com.asterbank.banking.security.domain.SecurityState.Binding;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.*;
import java.util.*;

public final class RecipientManagementService {
  private ActionAuthorizationService grants;

  public RecipientManagementService withAuthorizations(ActionAuthorizationService grants) {
    this.grants = java.util.Objects.requireNonNull(grants);
    return this;
  }

  private void authorize(String grant, Binding binding, VerificationAction action) {
    if (grants == null) throw new SecurityFailure("STEP_UP_AUTH_REQUIRED", 403);
    grants.require(grant, binding, action);
  }

  private final RecipientRepository reads;
  private final RecipientMutationPort store;
  private final IdempotencyRepository keys;
  private final IdGenerator ids;
  private final Clock clock;
  private final boolean demoDestinations;

  public RecipientManagementService(
      RecipientRepository reads,
      RecipientMutationPort store,
      IdempotencyRepository keys,
      IdGenerator ids,
      Clock clock,
      boolean demoDestinations) {
    this.reads = reads;
    this.store = store;
    this.keys = keys;
    this.ids = ids;
    this.clock = clock;
    this.demoDestinations = demoDestinations;
  }

  public Recipient get(CustomerId owner, String id) {
    try {
      return reads
          .find(owner, new RecipientId(id))
          .orElseThrow(() -> new PaymentFailure(RECIPIENT_NOT_FOUND));
    } catch (IllegalArgumentException e) {
      throw new PaymentFailure(RECIPIENT_NOT_FOUND);
    }
  }

  public RecipientAction prepare(
      CustomerId owner,
      String session,
      RecipientAction.Type type,
      String destination,
      String recipientId) {
    if (session == null || type == null) throw new PaymentFailure(INVALID_REQUEST);
    return store.write(
        owner,
        () -> {
          var at = OffsetDateTime.now(clock).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
          Recipient r;
          if (type == RecipientAction.Type.CREATE) {
            if (recipientId != null || !demoDestinations || destination == null)
              throw new PaymentFailure(INVALID_DESTINATION);
            String name;
            String masked;
            switch (destination) {
              case "demo-lin" -> {
                name = "Lin Wei";
                masked = "•••• 6201";
              }
              case "demo-lin-savings" -> {
                name = "Lin Wei";
                masked = "•••• 6202";
              }
              default -> throw new PaymentFailure(INVALID_DESTINATION);
            }
            if (store.destination(owner, destination).isPresent())
              throw new PaymentFailure(RECIPIENT_ALREADY_EXISTS);
            r =
                new Recipient(
                    new RecipientId(ids.next("recipient")),
                    owner,
                    name,
                    "Aster Demo Bank",
                    masked,
                    Currency.getInstance("CNY"),
                    destination,
                    Recipient.Status.ACTIVE,
                    at,
                    0);
          } else {
            if (destination != null) throw new PaymentFailure(INVALID_REQUEST);
            r = get(owner, recipientId);
            if (r.status() != Recipient.Status.ACTIVE) throw new PaymentFailure(RECIPIENT_INACTIVE);
          }
          var action =
              RecipientAction.prepare(ids.next("recipient_intent"), owner, session, type, r, at);
          store.save(action);
          return action;
        });
  }

  public RecipientAction intent(CustomerId owner, String session, String id) {
    var a =
        store.intent(owner, id).orElseThrow(() -> new PaymentFailure(RECIPIENT_INTENT_NOT_FOUND));
    if (!Objects.equals(session, a.sessionId()))
      throw new PaymentFailure(RECIPIENT_INTENT_NOT_FOUND);
    return a;
  }

  public String status(RecipientAction a) {
    if (store.result(a.owner(), a.id()).isPresent()) return "EXECUTED";
    return !clock.instant().isBefore(a.expiresAt().toInstant()) ? "EXPIRED" : "PREPARED";
  }

  public Recipient execute(
      CustomerId owner,
      String session,
      String id,
      String hash,
      String key,
      RecipientAction.Type expected) {
    return execute(owner, session, id, hash, key, expected, null, null);
  }

  public Recipient execute(
      CustomerId owner,
      String session,
      String id,
      String hash,
      String key,
      RecipientAction.Type expected,
      String grant,
      String correlation) {
    if (key == null || !key.matches("[A-Za-z0-9_-]{1,128}") || id == null || hash == null)
      throw new PaymentFailure(INVALID_REQUEST);
    return store.write(
        owner,
        () -> {
          var action = intent(owner, session, id);
          if (action.type() != expected) throw new PaymentFailure(INVALID_REQUEST);
          var scope = new IdempotencyRepository.Scope(owner, "RECIPIENT_" + expected, key);
          var fp = RecipientAction.digest(id, hash, session, expected.name(), grant);
          var prior = keys.find(scope);
          if (prior.isPresent()) {
            if (!prior.get().fingerprint().equals(fp))
              throw new PaymentFailure(IDEMPOTENCY_KEY_REUSED);
            return store.result(owner, prior.get().resourceId()).orElseThrow();
          }
          if (!action.hash().equals(hash)) throw new PaymentFailure(RECIPIENT_INTENT_HASH_MISMATCH);
          if (status(action).equals("EXECUTED"))
            throw new PaymentFailure(RECIPIENT_INTENT_ALREADY_EXECUTED);
          if (status(action).equals("EXPIRED")) throw new PaymentFailure(RECIPIENT_INTENT_EXPIRED);
          var binding = new Binding(owner.value(), session, "RECIPIENT_ACTION_INTENT", id, hash);
          authorize(
              grant,
              binding,
              expected == RecipientAction.Type.CREATE
                  ? VerificationAction.RECIPIENT_CREATE
                  : VerificationAction.RECIPIENT_DEACTIVATE);
          var r = action.recipient();
          if (expected == RecipientAction.Type.CREATE) {
            if (store.destination(owner, r.destinationRef()).isPresent())
              throw new PaymentFailure(RECIPIENT_ALREADY_EXISTS);
          } else {
            var current = get(owner, r.id().value());
            if (!current.equals(r)) throw new PaymentFailure(RECIPIENT_STATE_CHANGED);
            r = current.deactivate();
          }
          store.save(r);
          store.complete(owner, id, r);
          grants.consume(grant, binding, correlation);
          keys.save(new IdempotencyRepository.Completed(scope, fp, id));
          return r;
        });
  }
}
