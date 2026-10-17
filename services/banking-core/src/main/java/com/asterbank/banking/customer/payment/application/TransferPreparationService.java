package com.asterbank.banking.customer.payment.application;

import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.*;

public final class TransferPreparationService {
  private final TransferValidation validation;
  private final TransferIntentRepository intents;
  private final TransferExecutionBoundary boundary;
  private final IdGenerator ids;
  private final Clock clock;
  private final IntentHasher hasher = new IntentHasher();
  private final TransferFeePolicy fees = new TransferFeePolicy();

  public TransferPreparationService(
      TransferValidation validation,
      TransferIntentRepository intents,
      TransferExecutionBoundary boundary,
      IdGenerator ids,
      Clock clock) {
    this.validation = validation;
    this.intents = intents;
    this.boundary = boundary;
    this.ids = ids;
    this.clock = clock;
  }

  public TransferIntent prepare(CustomerId customer, PrepareTransfer request) {
    return prepare(customer, request, null);
  }

  public TransferIntent prepare(CustomerId customer, PrepareTransfer request, String session) {
    return prepare(customer, request, session, null);
  }

  public TransferIntent prepare(
      CustomerId customer, PrepareTransfer request, String session, String key) {
    if (key != null && (session == null || !key.matches("[A-Za-z0-9_-]{1,128}")))
      throw new PaymentFailure(PaymentFailure.Code.INVALID_REQUEST);
    return boundary.prepare(
        () -> {
          String fingerprint = key == null ? null : fingerprint(request);
          if (key != null) {
            var replay = intents.findPrepareReplay(customer, session, key);
            if (replay.isPresent()) {
              if (!replay.get().fingerprint().equals(fingerprint))
                throw new PaymentFailure(PaymentFailure.Code.IDEMPOTENCY_KEY_REUSED);
              var original =
                  intents
                      .find(customer, replay.get().intentId())
                      .orElseThrow(
                          () -> new PaymentFailure(PaymentFailure.Code.PERSISTENCE_UNAVAILABLE));
              return new TransferIntent(
                  original.terms(), original.intentHash(), original.statusAt(clock.instant()));
            }
          }
          var checked = validation.validate(customer, request);
          var fee = fees.fee(request.amount());
          var total = request.amount().add(fee);
          var now = OffsetDateTime.now(clock).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
          var terms =
              new IntentTerms(
                  ids.next("intent"),
                  customer,
                  checked.source(),
                  checked.recipient(),
                  request.amount(),
                  fee,
                  total,
                  checked.source().availableBalance().subtract(total),
                  request.note(),
                  now,
                  now.plusMinutes(15),
                  session,
                  session == null ? null : "CONFIRMATION",
                  session == null ? null : "PAYMENT_CONFIRMATION_V1");
          var intent =
              new TransferIntent(terms, hasher.hash(terms), TransferIntent.Status.PREPARED);
          intents.save(intent);
          if (key != null)
            intents.savePrepareReplay(customer, session, key, fingerprint, terms.id(), now);
          return intent;
        });
  }

  private static String fingerprint(PrepareTransfer r) {
    try {
      var digest = java.security.MessageDigest.getInstance("SHA-256");
      for (String part :
          java.util.List.of(
              r.sourceAccountId().value(),
              r.recipientId().value(),
              r.amount().amount().toPlainString(),
              r.amount().currency().getCurrencyCode(),
              r.note())) {
        var bytes = part.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        digest.update(java.nio.ByteBuffer.allocate(4).putInt(bytes.length).array());
        digest.update(bytes);
      }
      return java.util.HexFormat.of().formatHex(digest.digest());
    } catch (java.security.NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  public TransferIntent get(CustomerId customer, String id) {
    var intent =
        intents
            .find(customer, id)
            .orElseThrow(() -> new PaymentFailure(PaymentFailure.Code.TRANSFER_INTENT_NOT_FOUND));
    return new TransferIntent(
        intent.terms(), intent.intentHash(), intent.statusAt(clock.instant()));
  }

  public TransferIntent cancel(CustomerId customer, String id, String session, String reason) {
    if (!java.util.Set.of(
            "USER_CANCELLED",
            "TASK_REVISED",
            "TASK_FAILED",
            "MAX_STEPS_EXCEEDED",
            "REPLACED_BY_NEW_INTENT")
        .contains(reason)) throw new PaymentFailure(PaymentFailure.Code.INVALID_REQUEST);
    return boundary.cancel(
        () -> {
          var intent =
              intents
                  .find(customer, id)
                  .orElseThrow(
                      () -> new PaymentFailure(PaymentFailure.Code.TRANSFER_INTENT_NOT_FOUND));
          if (!java.util.Objects.equals(intent.terms().sessionId(), session))
            throw new PaymentFailure(PaymentFailure.Code.TRANSFER_SESSION_MISMATCH);
          var status = intent.statusAt(clock.instant());
          if (status == TransferIntent.Status.EXECUTED)
            throw new PaymentFailure(PaymentFailure.Code.TRANSFER_INTENT_ALREADY_EXECUTED);
          if (status == TransferIntent.Status.EXPIRED || status == TransferIntent.Status.CANCELLED)
            return new TransferIntent(intent.terms(), intent.intentHash(), status);
          var cancelled = intent.cancelled();
          intents.cancel(cancelled, reason);
          return cancelled;
        });
  }
}
