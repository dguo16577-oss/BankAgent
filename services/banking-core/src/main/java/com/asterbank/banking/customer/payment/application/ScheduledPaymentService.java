package com.asterbank.banking.customer.payment.application;

import static com.asterbank.banking.customer.payment.application.PaymentFailure.Code.*;

import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.security.application.ActionAuthorizationService;
import com.asterbank.banking.security.domain.SecurityState.Binding;
import com.asterbank.banking.shared.domain.*;
import java.time.*;
import java.util.*;

public final class ScheduledPaymentService {
  public static final String POLICY = "PAYMENT_CONFIRMATION_V1";
  private final ScheduleStore store;
  private final TransferValidation validation;
  private final TransferExecutionService transfers;
  private final TransferIntentRepository transferIntents;
  private final IdempotencyRepository keys;
  private final ActionAuthorizationService grants;
  private final IdGenerator ids;
  private final Clock clock;

  public ScheduledPaymentService(
      ScheduleStore store,
      TransferValidation validation,
      TransferExecutionService transfers,
      TransferIntentRepository transferIntents,
      IdempotencyRepository keys,
      ActionAuthorizationService grants,
      IdGenerator ids,
      Clock clock) {
    this.store = store;
    this.validation = validation;
    this.transfers = transfers;
    this.transferIntents = transferIntents;
    this.keys = keys;
    this.grants = grants;
    this.ids = ids;
    this.clock = clock;
  }

  private OffsetDateTime now() {
    return OffsetDateTime.now(clock).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
  }

  public List<ScheduledPayment> list(CustomerId c) {
    return store.list(c);
  }

  public ScheduledPayment get(CustomerId c, String id) {
    return store.find(c, id).orElseThrow(() -> new PaymentFailure(SCHEDULE_NOT_FOUND));
  }

  private void mutable(ScheduledPayment p, int expected) {
    if (p.status() != ScheduledPayment.Status.SCHEDULED || p.version() != expected)
      throw new PaymentFailure(SCHEDULE_STATE_CHANGED);
    if (!clock.instant().isBefore(p.dueAt().toInstant()))
      throw new PaymentFailure(SCHEDULE_ALREADY_DUE);
  }

  public ScheduleAction prepare(
      CustomerId c,
      String session,
      ScheduleAction.Type type,
      String scheduleId,
      Integer expected,
      PrepareTransfer request,
      OffsetDateTime due) {
    if (session == null || type == null) throw new PaymentFailure(INVALID_REQUEST);
    return store.write(
        c,
        () -> {
          var at = now();
          ScheduledPayment old = null;
          if (type != ScheduleAction.Type.CREATE) {
            if (scheduleId == null || expected == null) throw new PaymentFailure(INVALID_REQUEST);
            old = get(c, scheduleId);
            mutable(old, expected);
          } else if (scheduleId != null || expected != null)
            throw new PaymentFailure(INVALID_REQUEST);
          ScheduledPayment proposed;
          if (type == ScheduleAction.Type.CANCEL) {
            if (request != null || due != null) throw new PaymentFailure(INVALID_REQUEST);
            proposed = old;
          } else {
            if (request == null || due == null || !due.toInstant().isAfter(clock.instant()))
              throw new PaymentFailure(INVALID_SCHEDULE_TIME);
            if (old != null && !old.terms().sourceAccount().id().equals(request.sourceAccountId()))
              throw new PaymentFailure(INVALID_REQUEST);
            var checked = validation.validate(c, request);
            var fee = new TransferFeePolicy().fee(request.amount());
            var total = request.amount().add(fee);
            if (checked.source().availableBalance().amount().compareTo(total.amount()) < 0)
              throw new PaymentFailure(INSUFFICIENT_FUNDS);
            var id = old == null ? ids.next("schedule") : old.id();
            var version = old == null ? 0 : old.version() + 1;
            // The mandate is independent of login expiry; session binding belongs to this action
            // only.
            var terms =
                new IntentTerms(
                    ids.next("scheduled_transfer_intent"),
                    c,
                    checked.source(),
                    checked.recipient(),
                    request.amount(),
                    fee,
                    total,
                    checked.source().availableBalance().subtract(total),
                    request.note(),
                    at,
                    at.plusMinutes(15),
                    null,
                    "CONFIRMATION",
                    POLICY);
            var normalizedDue = due.truncatedTo(java.time.temporal.ChronoUnit.MICROS);
            proposed =
                new ScheduledPayment(
                    id,
                    c,
                    terms,
                    normalizedDue,
                    ScheduledPayment.Status.SCHEDULED,
                    version,
                    ScheduledPayment.hash(id, terms, normalizedDue, version),
                    old == null ? at : old.createdAt(),
                    at,
                    null,
                    null,
                    null,
                    null);
          }
          var action =
              ScheduleAction.prepare(
                  ids.next("schedule_action"),
                  session,
                  type,
                  old == null ? -1 : old.version(),
                  proposed,
                  at);
          store.save(action);
          return action;
        });
  }

  public ScheduleAction intent(CustomerId c, String session, String id) {
    var a = store.intent(c, id).orElseThrow(() -> new PaymentFailure(SCHEDULE_INTENT_NOT_FOUND));
    if (!Objects.equals(session, a.sessionId()))
      throw new PaymentFailure(TRANSFER_SESSION_MISMATCH);
    return a;
  }

  public String status(ScheduleAction a) {
    if (store.result(a.customerId(), a.id()).isPresent()) return "EXECUTED";
    if (store.cancelled(a.customerId(), a.id())) return "CANCELLED";
    return !clock.instant().isBefore(a.expiresAt().toInstant()) ? "EXPIRED" : "PREPARED";
  }

  public ScheduleAction cancelIntent(CustomerId c, String session, String id, String reason) {
    if (!Set.of(
            "USER_CANCELLED",
            "TASK_REVISED",
            "TASK_FAILED",
            "MAX_STEPS_EXCEEDED",
            "REPLACED_BY_NEW_INTENT")
        .contains(reason)) throw new PaymentFailure(INVALID_REQUEST);
    return store.write(
        c,
        () -> {
          store.lockIntent(c, id);
          var action = intent(c, session, id);
          var current = status(action);
          if (current.equals("CANCELLED")) return action;
          if (!current.equals("PREPARED")) throw new PaymentFailure(SCHEDULE_INTENT_UNAVAILABLE);
          if (!store.cancelIntent(c, id, now()))
            throw new PaymentFailure(SCHEDULE_INTENT_UNAVAILABLE);
          return action;
        });
  }

  public ScheduledPayment confirm(
      CustomerId c,
      String session,
      String id,
      String hash,
      String key,
      String grant,
      String correlation) {
    if (key == null || !key.matches("[A-Za-z0-9_-]{1,128}"))
      throw new PaymentFailure(INVALID_REQUEST);
    return store.write(
        c,
        () -> {
          store.lockIntent(c, id);
          var a = intent(c, session, id);
          var scope = new IdempotencyRepository.Scope(c, "SCHEDULE_ACTION", key);
          var fp = RecipientAction.digest(id, hash, session, grant);
          var prior = keys.find(scope);
          if (prior.isPresent()) {
            if (!fp.equals(prior.get().fingerprint()))
              throw new PaymentFailure(IDEMPOTENCY_KEY_REUSED);
            return store.result(c, prior.get().resourceId()).orElseThrow();
          }
          if (!a.intentHash().equals(hash)) throw new PaymentFailure(SCHEDULE_INTENT_HASH_MISMATCH);
          if (!status(a).equals("PREPARED")) throw new PaymentFailure(SCHEDULE_INTENT_UNAVAILABLE);
          var p = a.proposed();
          var recipientIds = new ArrayList<String>();
          recipientIds.add(p.terms().recipient().id().value());
          if (a.actionType() != ScheduleAction.Type.CREATE)
            recipientIds.add(get(c, p.id()).terms().recipient().id().value());
          store.lockRecipients(c, recipientIds);
          store.lockSchedule(c, p.id());
          if (a.actionType() != ScheduleAction.Type.CREATE)
            mutable(get(c, p.id()), a.expectedVersion());
          var binding = new Binding(c.value(), session, "SCHEDULE_ACTION_INTENT", id, hash);
          grants.require(
              grant,
              binding,
              switch (a.actionType()) {
                case CREATE ->
                    com.asterbank.banking.security.domain.VerificationAction
                        .SCHEDULED_PAYMENT_CREATE;
                case AMEND ->
                    com.asterbank.banking.security.domain.VerificationAction
                        .SCHEDULED_PAYMENT_MODIFY;
                case CANCEL ->
                    com.asterbank.banking.security.domain.VerificationAction
                        .SCHEDULED_PAYMENT_CANCEL;
              });
          if (a.actionType() == ScheduleAction.Type.CANCEL)
            p = p.finish(ScheduledPayment.Status.CANCELLED, now(), null, null);
          else {
            if (!p.dueAt().toInstant().isAfter(clock.instant()))
              throw new PaymentFailure(INVALID_SCHEDULE_TIME);
            var t = p.terms();
            var checked =
                validation.validate(
                    c,
                    new PrepareTransfer(
                        t.sourceAccount().id(), t.recipient().id(), t.amount(), t.note()));
            if (!checked.recipient().sameTransferIdentityAs(t.recipient()))
              throw new PaymentFailure(RECIPIENT_STATE_CHANGED);
          }
          store.save(p);
          if (grant != null) grants.consume(grant, binding, correlation);
          store.complete(c, id, p);
          keys.save(new IdempotencyRepository.Completed(scope, fp, id));
          return p;
        });
  }

  /**
   * Internal operator capability, never a Customer/Public endpoint. Each item commits
   * independently.
   */
  public int processDue() {
    int processed = 0;
    for (var candidate : store.due(clock.instant())) {
      store.write(
          candidate.customerId(),
          () -> {
            var c = candidate.customerId();
            // Owner lock first coordinates with all B2 writes; recipient then schedule then
            // account.
            var current = get(c, candidate.id());
            store.lockRecipients(c, List.of(current.terms().recipient().id().value()));
            store.lockSchedule(c, candidate.id());
            var p = get(c, candidate.id());
            if (p.status() != ScheduledPayment.Status.SCHEDULED
                || clock.instant().isBefore(p.dueAt().toInstant())) return p;
            var t = p.terms();
            String failure = null;
            try {
              if (!p.mandateHash().equals(ScheduledPayment.hash(p.id(), t, p.dueAt(), p.version()))
                  || !POLICY.equals(t.policyVersion())
                  || !"CONFIRMATION".equals(t.authorizationRequirement())
                  || !new TransferFeePolicy().fee(t.amount()).equals(t.fee())
                  || !t.amount().add(t.fee()).equals(t.totalDebit()))
                throw new PaymentFailure(SCHEDULE_TERMS_INVALID);
              var checked =
                  validation.validate(
                      c,
                      new PrepareTransfer(
                          t.sourceAccount().id(), t.recipient().id(), t.amount(), t.note()));
              if (!checked.recipient().sameTransferIdentityAs(t.recipient()))
                throw new PaymentFailure(RECIPIENT_STATE_CHANGED);
            } catch (PaymentFailure e) {
              failure = e.code().name();
            }
            if (failure != null) {
              var failed = p.finish(ScheduledPayment.Status.FAILED, now(), null, failure);
              store.save(failed);
              return failed;
            }
            // A fresh internal transfer record captures the durable mandate; no expired browser
            // intent replay.
            var intent =
                new TransferIntent(t, new IntentHasher().hash(t), TransferIntent.Status.PREPARED);
            transferIntents.save(intent);
            var transfer = transfers.settle(c, t);
            transferIntents.save(intent.executed());
            var done = p.finish(ScheduledPayment.Status.EXECUTED, now(), transfer, null);
            store.save(done);
            return done;
          });
      processed++;
    }
    return processed;
  }
}
