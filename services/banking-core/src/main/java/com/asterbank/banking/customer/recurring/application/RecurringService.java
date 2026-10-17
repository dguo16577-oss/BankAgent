package com.asterbank.banking.customer.recurring.application;

import static com.asterbank.banking.customer.recurring.domain.RecurringFailure.Code.*;

import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.recurring.domain.*;
import com.asterbank.banking.customer.transaction.application.TransactionRepository;
import com.asterbank.banking.customer.transaction.domain.TransactionId;
import com.asterbank.banking.security.application.*;
import com.asterbank.banking.security.domain.*;
import com.asterbank.banking.security.domain.SecurityState.Binding;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

public final class RecurringService {
  private ActionAuthorizationService grants;

  public RecurringService withAuthorizations(ActionAuthorizationService grants) {
    this.grants = java.util.Objects.requireNonNull(grants);
    return this;
  }

  private void authorize(String grant, Binding binding, VerificationAction action) {
    if (grants == null) throw new SecurityFailure("STEP_UP_AUTH_REQUIRED", 403);
    grants.require(grant, binding, action);
  }

  private final RecurringStore store;
  private final TransactionRepository transactions;
  private final IdempotencyRepository keys;
  private final IdGenerator ids;
  private final Clock clock;
  private final RecurringExecutionCheckpoint checkpoint;
  private final RecurringIntentHasher hasher = new RecurringIntentHasher();

  public RecurringService(
      RecurringStore store,
      TransactionRepository transactions,
      IdempotencyRepository keys,
      IdGenerator ids,
      Clock clock,
      RecurringExecutionCheckpoint checkpoint) {
    this.store = store;
    this.transactions = transactions;
    this.keys = keys;
    this.ids = ids;
    this.clock = clock;
    this.checkpoint = checkpoint;
  }

  public List<RecurringPayment> list(CustomerId owner) {
    return store.list(owner);
  }

  public RecurringPayment detail(CustomerId owner, String id) {
    return store.read(
        () -> {
          var p =
              store
                  .payment(owner, id)
                  .orElseThrow(() -> new RecurringFailure(RECURRING_PAYMENT_NOT_FOUND));
          // Transaction application port is authoritative; links never expose another customer's
          // history.
          for (String tx : p.transactionHistory()) {
            var t =
                transactions
                    .find(owner, new TransactionId(tx))
                    .orElseThrow(() -> new RecurringFailure(PERSISTENCE_UNAVAILABLE));
            if (!t.accountId().value().equals(p.sourceAccountId()))
              throw new RecurringFailure(PERSISTENCE_UNAVAILABLE);
          }
          return p;
        });
  }

  public RecurringIntent prepare(CustomerId owner, String id) {
    if (id == null || id.isEmpty()) throw new RecurringFailure(INVALID_REQUEST);
    return store.write(
        () -> {
          var p = detail(owner, id);
          var after = p.stop();
          var now = OffsetDateTime.now(clock).truncatedTo(ChronoUnit.MICROS);
          var t =
              new RecurringIntent.Terms(
                  ids.next("recurring_intent"),
                  p,
                  after.state(),
                  p.effectDescription(),
                  now,
                  now.plusMinutes(15));
          var i = new RecurringIntent(t, hasher.hash(t), RecurringIntent.Status.PREPARED);
          store.save(i);
          return i;
        });
  }

  private RecurringIntent stored(CustomerId owner, String id) {
    return store
        .intent(owner, id)
        .orElseThrow(() -> new RecurringFailure(RECURRING_PAYMENT_INTENT_NOT_FOUND));
  }

  public RecurringIntent intent(CustomerId owner, String id) {
    var i = stored(owner, id);
    return new RecurringIntent(i.terms(), i.intentHash(), i.statusAt(clock.instant()));
  }

  public RecurringIntent cancel(CustomerId owner, String id) {
    if (id == null || id.isEmpty()) throw new RecurringFailure(INVALID_REQUEST);
    return store.write(
        () -> {
          var i = stored(owner, id);
          var status = i.statusAt(clock.instant());
          if (status == RecurringIntent.Status.PREPARED) {
            var cancelled = i.cancelled();
            store.save(cancelled);
            return cancelled;
          }
          if (status == RecurringIntent.Status.EXPIRED
              && i.status() == RecurringIntent.Status.PREPARED)
            store.save(new RecurringIntent(i.terms(), i.intentHash(), status));
          return new RecurringIntent(i.terms(), i.intentHash(), status);
        });
  }

  public RecurringAction action(CustomerId owner, String id) {
    return store
        .action(owner, id)
        .orElseThrow(() -> new RecurringFailure(RECURRING_PAYMENT_ACTION_NOT_FOUND));
  }

  public RecurringAction execute(CustomerId owner, String id, String hash, String key) {
    return execute(owner, id, hash, key, null, null, null);
  }

  public RecurringAction execute(
      CustomerId owner,
      String id,
      String hash,
      String key,
      String session,
      String grant,
      String correlation) {
    if (id == null || hash == null || key == null || !key.matches("[A-Za-z0-9_-]{1,128}"))
      throw new RecurringFailure(INVALID_REQUEST);
    return store.write(
        () -> {
          var scope =
              new IdempotencyRepository.Scope(owner, "EXECUTE_RECURRING_PAYMENT_ACTION", key);
          var fingerprint =
              com.asterbank.banking.customer.payment.domain.RecipientAction.digest(
                  hasher.fingerprint(id, hash), session, grant);
          var old = keys.find(scope);
          if (old.isPresent()) {
            if (!old.get().fingerprint().equals(fingerprint))
              throw new RecurringFailure(IDEMPOTENCY_KEY_REUSED);
            return action(owner, old.get().resourceId());
          }
          var binding = new Binding(owner.value(), session, "RECURRING_PAYMENT_INTENT", id, hash);
          var i = stored(owner, id);
          if (!i.intentHash().equals(hash) || !hasher.hash(i.terms()).equals(hash))
            throw new RecurringFailure(RECURRING_PAYMENT_INTENT_HASH_MISMATCH);
          if (i.status() == RecurringIntent.Status.EXECUTED)
            throw new RecurringFailure(RECURRING_PAYMENT_INTENT_ALREADY_EXECUTED);
          if (i.status() == RecurringIntent.Status.CANCELLED)
            throw new RecurringFailure(RECURRING_PAYMENT_INTENT_CANCELLED);
          if (i.statusAt(clock.instant()) == RecurringIntent.Status.EXPIRED)
            throw new RecurringFailure(RECURRING_PAYMENT_INTENT_EXPIRED);
          var p = detail(owner, i.terms().payment().id());
          if (!p.equals(i.terms().payment()))
            throw new RecurringFailure(RECURRING_PAYMENT_STATE_CHANGED);
          var changed = p.stop();
          if (!changed.state().equals(i.terms().after()))
            throw new RecurringFailure(RECURRING_PAYMENT_STATE_CHANGED);
          authorize(grant, binding, VerificationAction.RECURRING_STOP_FUTURE_PAYMENTS);
          store.save(changed);
          checkpoint.reached(RecurringExecutionCheckpoint.Stage.AFTER_RECURRING_MUTATION);
          var actionId = ids.next("recurring_action");
          var a =
              new RecurringAction(
                  actionId,
                  i.terms(),
                  changed,
                  "ASTER-RECURRING-" + actionId,
                  OffsetDateTime.now(clock).truncatedTo(ChronoUnit.MICROS));
          checkpoint.reached(RecurringExecutionCheckpoint.Stage.BEFORE_ACTION_PERSISTENCE);
          store.save(a);
          store.save(i.executed());
          checkpoint.reached(RecurringExecutionCheckpoint.Stage.BEFORE_IDEMPOTENCY_COMPLETION);
          grants.consume(grant, binding, correlation);
          keys.save(new IdempotencyRepository.Completed(scope, fingerprint, actionId));
          return a;
        });
  }
}
