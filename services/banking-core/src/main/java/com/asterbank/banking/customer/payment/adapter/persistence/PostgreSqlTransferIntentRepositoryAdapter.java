package com.asterbank.banking.customer.payment.adapter.persistence;

import com.asterbank.banking.customer.payment.application.TransferIntentRepository;
import com.asterbank.banking.customer.payment.domain.TransferIntent;
import com.asterbank.banking.shared.adapter.persistence.DatabaseScope;
import com.asterbank.banking.shared.domain.CustomerId;
import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public final class PostgreSqlTransferIntentRepositoryAdapter implements TransferIntentRepository {
  private final DatabaseScope db;
  private final SnapshotCodec codec;

  public PostgreSqlTransferIntentRepositoryAdapter(DatabaseScope db, SnapshotCodec codec) {
    this.db = db;
    this.codec = codec;
  }

  public Optional<TransferIntent> find(CustomerId c, String id) {
    return db.read(
        () -> {
          db.lockOwnerForWrite(c);
          var q =
              db.entityManager()
                  .createQuery(
                      "from TransferIntentJpaEntity where intentId=:id and customerId=:c",
                      TransferIntentJpaEntity.class)
                  .setParameter("id", id)
                  .setParameter("c", c.value());
          if (!TransactionSynchronizationManager.isCurrentTransactionReadOnly())
            q.setLockMode(LockModeType.PESSIMISTIC_WRITE);
          return q.getResultList().stream()
              .findFirst()
              .map(
                  e ->
                      new TransferIntent(
                          codec.intent(e.snapshot),
                          e.intentHash,
                          TransferIntent.Status.valueOf(e.status)));
        });
  }

  public void save(TransferIntent intent) {
    var t = intent.terms();
    var existing = find(t.customerId(), t.id());
    if (existing.isPresent()) {
      var old = existing.get();
      if (!old.terms().equals(t) || !old.intentHash().equals(intent.intentHash()))
        throw new IllegalStateException("Immutable terms changed");
      if (old.status() != TransferIntent.Status.PREPARED && old.status() != intent.status())
        throw new IllegalStateException("Invalid lifecycle transition");
      db.entityManager()
          .createQuery(
              "update TransferIntentJpaEntity set status=:s where intentId=:id and customerId=:c")
          .setParameter("s", intent.status().name())
          .setParameter("id", t.id())
          .setParameter("c", t.customerId().value())
          .executeUpdate();
    } else {
      var e = new TransferIntentJpaEntity();
      e.intentId = t.id();
      e.customerId = t.customerId().value();
      e.sourceAccountId = t.sourceAccount().id().value();
      e.recipientId = t.recipient().id().value();
      e.amount = t.amount().amount();
      e.fee = t.fee().amount();
      e.totalDebit = t.totalDebit().amount();
      e.currency = t.amount().currency().getCurrencyCode();
      e.status = intent.status().name();
      e.intentHash = intent.intentHash();
      e.createdAt = t.createdAt();
      e.expiresAt = t.expiresAt();
      e.snapshot = codec.intent(t);
      db.entityManager().persist(e);
    }
    db.entityManager().flush();
  }

  public void cancel(TransferIntent intent, String reason) {
    var t = intent.terms();
    var old = find(t.customerId(), t.id()).orElseThrow();
    if (old.status() != TransferIntent.Status.PREPARED
        || intent.status() != TransferIntent.Status.CANCELLED
        || !old.terms().equals(t)
        || !old.intentHash().equals(intent.intentHash()))
      throw new IllegalStateException("Invalid intent cancellation");
    int changed =
        db.entityManager()
            .createNativeQuery(
                "update transfer_intents set status='CANCELLED', cancellation_reason=:reason where intent_id=:id and customer_id=:customer and status='PREPARED'")
            .setParameter("reason", reason)
            .setParameter("id", t.id())
            .setParameter("customer", t.customerId().value())
            .executeUpdate();
    if (changed != 1) throw new IllegalStateException("Intent cancellation race");
    db.entityManager().flush();
  }

  public Optional<PrepareReplay> findPrepareReplay(CustomerId c, String session, String key) {
    db.lockOwnerForWrite(c);
    @SuppressWarnings("unchecked")
    var rows =
        (java.util.List<Object[]>)
            db.entityManager()
                .createNativeQuery(
                    "select request_fingerprint,intent_id from transfer_prepare_idempotency where customer_id=:customer and session_id=:session and idempotency_key=:key")
                .setParameter("customer", c.value())
                .setParameter("session", session)
                .setParameter("key", key)
                .getResultList();
    return rows.stream()
        .findFirst()
        .map(row -> new PrepareReplay((String) row[0], (String) row[1]));
  }

  public void savePrepareReplay(
      CustomerId c,
      String session,
      String key,
      String fingerprint,
      String intentId,
      java.time.OffsetDateTime createdAt) {
    db.entityManager()
        .createNativeQuery(
            "insert into transfer_prepare_idempotency (customer_id,session_id,idempotency_key,request_fingerprint,intent_id,created_at) values (:customer,:session,:key,:fingerprint,:intent,:created)")
        .setParameter("customer", c.value())
        .setParameter("session", session)
        .setParameter("key", key)
        .setParameter("fingerprint", fingerprint)
        .setParameter("intent", intentId)
        .setParameter("created", createdAt)
        .executeUpdate();
  }
}
