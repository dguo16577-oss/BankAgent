package com.asterbank.banking.customer.payment.adapter.persistence;

import com.asterbank.banking.customer.payment.application.TransferRepository;
import com.asterbank.banking.customer.payment.domain.Transfer;
import com.asterbank.banking.shared.adapter.persistence.DatabaseScope;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.*;

public final class PostgreSqlTransferRepositoryAdapter implements TransferRepository {
  private final DatabaseScope db;
  private final SnapshotCodec codec;

  public PostgreSqlTransferRepositoryAdapter(DatabaseScope db, SnapshotCodec codec) {
    this.db = db;
    this.codec = codec;
  }

  public Optional<Transfer> find(CustomerId c, String id) {
    return db.read(
        () ->
            db
                .entityManager()
                .createQuery(
                    "from TransferJpaEntity where transferId=:id and customerId=:c",
                    TransferJpaEntity.class)
                .setParameter("id", id)
                .setParameter("c", c.value())
                .getResultList()
                .stream()
                .findFirst()
                .map(e -> codec.transfer(e.snapshot)));
  }

  public void save(Transfer transfer) {
    var t = transfer.terms();
    var e = new TransferJpaEntity();
    e.transferId = transfer.id();
    e.customerId = transfer.customerId().value();
    e.intentId = t.id();
    e.sourceAccountId = transfer.sourceAccount().id().value();
    e.recipientId = transfer.recipient().id().value();
    e.amount = t.amount().amount();
    e.fee = t.fee().amount();
    e.totalDebit = t.totalDebit().amount();
    e.currency = t.amount().currency().getCurrencyCode();
    e.status = "COMPLETED";
    e.transactionId = transfer.transactionId().value();
    e.reference = transfer.reference();
    e.createdAt = transfer.completedAt();
    e.completedAt = transfer.completedAt();
    e.snapshot = codec.transfer(transfer);
    db.entityManager().persist(e);
    db.entityManager().flush();
  }
}
