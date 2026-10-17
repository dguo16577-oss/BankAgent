package com.asterbank.banking.customer.payment.application;

import static com.asterbank.banking.customer.payment.application.PaymentFailure.Code.*;

import com.asterbank.banking.customer.account.application.AccountRepository;
import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.security.application.ActionAuthorizationService;
import com.asterbank.banking.security.domain.SecurityState.Binding;
import com.asterbank.banking.security.domain.VerificationAction;
import com.asterbank.banking.shared.domain.*;
import java.time.*;
import java.util.*;

/** Bank-owned AA lifecycle. Preparing or confirming a bill never debits a participant. */
public final class SplitRequestService {
  public record Share(RecipientId recipientId, Money amountDue) {}

  private final SplitStore store;
  private final AccountRepository accounts;
  private final RecipientRepository recipients;
  private final IdempotencyRepository keys;
  private final ActionAuthorizationService grants;
  private final IdGenerator ids;
  private final Clock clock;

  public SplitRequestService(
      SplitStore store,
      AccountRepository accounts,
      RecipientRepository recipients,
      IdempotencyRepository keys,
      ActionAuthorizationService grants,
      IdGenerator ids,
      Clock clock) {
    this.store = store;
    this.accounts = accounts;
    this.recipients = recipients;
    this.keys = keys;
    this.grants = grants;
    this.ids = ids;
    this.clock = clock;
  }

  private OffsetDateTime now() {
    return OffsetDateTime.now(clock).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
  }

  public List<SplitBill> list(CustomerId c, boolean participant) {
    return participant ? store.participantBills(c) : store.ownerBills(c);
  }

  public SplitBill get(CustomerId c, String id, boolean participant) {
    return (participant ? store.participantBill(c, id) : store.bill(c, id))
        .orElseThrow(() -> new PaymentFailure(SPLIT_NOT_FOUND));
  }

  public SplitActionIntent prepareCreate(
      CustomerId c,
      String session,
      AccountId receiving,
      Money total,
      Money payerShare,
      List<Share> shares,
      String note) {
    return store.write(
        c,
        () -> {
          var account =
              accounts.find(c, receiving).orElseThrow(() -> new PaymentFailure(ACCOUNT_NOT_FOUND));
          if (account.status() != AccountStatus.ACTIVE
              || account.type() == AccountType.TIME_DEPOSIT
              || !"CNY".equals(account.balance().currency().getCurrencyCode()))
            throw new PaymentFailure(ACCOUNT_NOT_ELIGIBLE);
          if (shares == null || shares.isEmpty() || shares.size() > 20)
            throw new PaymentFailure(INVALID_REQUEST);
          var participants = new ArrayList<SplitParticipant>();
          for (var share : shares) {
            var recipient =
                recipients
                    .find(c, share.recipientId())
                    .orElseThrow(() -> new PaymentFailure(RECIPIENT_NOT_FOUND));
            if (recipient.status() != Recipient.Status.ACTIVE
                || !"CNY".equals(recipient.currency().getCurrencyCode()))
              throw new PaymentFailure(RECIPIENT_NOT_ELIGIBLE);
            var target =
                store
                    .verifiedTarget(c, recipient.id())
                    .orElseThrow(() -> new PaymentFailure(SPLIT_RECIPIENT_UNAVAILABLE));
            participants.add(
                new SplitParticipant(
                    ids.next("split_participant"),
                    recipient.id(),
                    target.customerId(),
                    target.accountId(),
                    share.amountDue(),
                    SplitParticipant.Status.PENDING));
          }
          var at = now();
          SplitBill bill;
          try {
            bill =
                new SplitBill(
                    ids.next("split"),
                    c,
                    receiving,
                    total,
                    payerShare,
                    participants,
                    note,
                    SplitBill.Status.ACTIVE,
                    0,
                    at,
                    at.plusDays(30),
                    null);
          } catch (IllegalArgumentException | ArithmeticException e) {
            throw new PaymentFailure(INVALID_REQUEST);
          }
          var intent =
              SplitActionIntent.prepare(
                  ids.next("split_action"), session, SplitActionIntent.Type.CREATE, bill, at);
          store.saveIntent(intent);
          return intent;
        });
  }

  public SplitActionIntent prepareCancel(
      CustomerId c, String session, String splitId, int version) {
    return store.write(
        c,
        () -> {
          var bill = get(c, splitId, false);
          if (bill.status() != SplitBill.Status.ACTIVE
              || bill.version() != version
              || !now().isBefore(bill.expiresAt())) throw new PaymentFailure(SPLIT_STATE_CHANGED);
          var intent =
              SplitActionIntent.prepare(
                  ids.next("split_action"), session, SplitActionIntent.Type.CANCEL, bill, now());
          store.saveIntent(intent);
          return intent;
        });
  }

  public SplitActionIntent intent(CustomerId c, String session, String id) {
    var intent = store.intent(c, id).orElseThrow(() -> new PaymentFailure(SPLIT_INTENT_NOT_FOUND));
    if (!intent.sessionId().equals(session)) throw new PaymentFailure(TRANSFER_SESSION_MISMATCH);
    return intent;
  }

  public SplitActionIntent cancelIntent(CustomerId c, String session, String id, String reason) {
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
          var intent = intent(c, session, id);
          var status = intent.statusAt(now());
          if (status == SplitActionIntent.Status.CANCELLED
              || status == SplitActionIntent.Status.EXPIRED) return intent;
          if (status != SplitActionIntent.Status.PREPARED)
            throw new PaymentFailure(SPLIT_INTENT_UNAVAILABLE);
          var cancelled = intent.transition(SplitActionIntent.Status.CANCELLED, now());
          store.saveIntent(cancelled);
          return cancelled;
        });
  }

  public SplitBill confirm(
      CustomerId c,
      String session,
      String id,
      String hash,
      String key,
      String authorization,
      String correlation) {
    if (key == null || !key.matches("[A-Za-z0-9_-]{1,128}"))
      throw new PaymentFailure(INVALID_REQUEST);
    return store.write(
        c,
        () -> {
          var intent = intent(c, session, id);
          var scope = new IdempotencyRepository.Scope(c, "SPLIT_ACTION", key);
          var fingerprint = RecipientAction.digest(id, hash, session, authorization);
          var prior = keys.find(scope);
          if (prior.isPresent()) {
            if (!fingerprint.equals(prior.get().fingerprint()))
              throw new PaymentFailure(IDEMPOTENCY_KEY_REUSED);
            var splitId =
                store
                    .result(c, prior.get().resourceId())
                    .orElseThrow(() -> new PaymentFailure(PERSISTENCE_UNAVAILABLE));
            return get(c, splitId, false);
          }
          if (!intent.intentHash().equals(hash))
            throw new PaymentFailure(SPLIT_INTENT_HASH_MISMATCH);
          if (intent.statusAt(now()) != SplitActionIntent.Status.PREPARED)
            throw new PaymentFailure(SPLIT_INTENT_UNAVAILABLE);
          var binding = new Binding(c.value(), session, "SPLIT_ACTION_INTENT", id, hash);
          var action =
              intent.actionType() == SplitActionIntent.Type.CREATE
                  ? VerificationAction.SPLIT_REQUEST_CREATE
                  : VerificationAction.SPLIT_REQUEST_CANCEL;
          grants.require(authorization, binding, action);
          SplitBill bill;
          if (intent.actionType() == SplitActionIntent.Type.CREATE) {
            bill = intent.reviewedBill();
            if (store.bill(c, bill.id()).isPresent()) throw new PaymentFailure(SPLIT_STATE_CHANGED);
            for (var part : bill.participants()) {
              var target =
                  store
                      .verifiedTarget(c, part.recipientId())
                      .orElseThrow(() -> new PaymentFailure(SPLIT_RECIPIENT_UNAVAILABLE));
              if (!target.customerId().equals(part.targetCustomerId())
                  || !target.accountId().equals(part.targetAccountId()))
                throw new PaymentFailure(SPLIT_RECIPIENT_UNAVAILABLE);
            }
          } else {
            var current = get(c, intent.splitId(), false);
            if (current.status() != SplitBill.Status.ACTIVE
                || current.version() != intent.expectedVersion())
              throw new PaymentFailure(SPLIT_STATE_CHANGED);
            bill = current.cancel(now());
          }
          store.saveBill(bill);
          grants.consume(authorization, binding, correlation);
          store.saveIntent(intent.transition(SplitActionIntent.Status.EXECUTED, now()));
          keys.save(new IdempotencyRepository.Completed(scope, fingerprint, id));
          return bill;
        });
  }
}
