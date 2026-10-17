package com.asterbank.banking.customer.payment.adapter.persistence;

import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.shared.adapter.persistence.DatabaseScope;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

public final class PostgreSqlRecipientMutationAdapter implements RecipientMutationPort {
  private final DatabaseScope db;
  private final ObjectMapper json;
  private final TransactionTemplate tx;

  public PostgreSqlRecipientMutationAdapter(
      DatabaseScope db, ObjectMapper json, PlatformTransactionManager manager) {
    this.db = db;
    this.json = json;
    tx = new TransactionTemplate(manager);
    tx.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
  }

  public <T> T write(CustomerId owner, Supplier<T> action) {
    return tx.execute(
        s -> {
          db.lockOwnerForWrite(owner);
          return action.get();
        });
  }

  public Optional<Recipient> destination(CustomerId owner, String destination) {
    return db.read(
        () ->
            db
                .entityManager()
                .createQuery(
                    "from RecipientJpaEntity where customerId=:c and destinationRef=:d",
                    RecipientJpaEntity.class)
                .setParameter("c", owner.value())
                .setParameter("d", destination)
                .getResultList()
                .stream()
                .findFirst()
                .map(PostgreSqlRecipientRepositoryAdapter::domain));
  }

  public void save(Recipient r) {
    var entity = PostgreSqlRecipientRepositoryAdapter.entity(r);
    var existing = db.entityManager().find(RecipientJpaEntity.class, r.id().value());
    if (existing != null) entity.phoneE164 = existing.phoneE164;
    db.entityManager().merge(entity);
    db.entityManager().flush();
  }

  public void save(RecipientAction a) {
    var e = new RecipientIntentJpaEntity();
    e.id = a.id();
    e.owner = a.owner().value();
    e.createdAt = a.createdAt();
    e.snapshot = json.writeValueAsString(a);
    db.entityManager().persist(e);
    db.entityManager().flush();
  }

  private Optional<RecipientIntentJpaEntity> row(CustomerId owner, String id) {
    return db
        .entityManager()
        .createQuery(
            "from RecipientIntentJpaEntity where owner=:c and id=:id",
            RecipientIntentJpaEntity.class)
        .setParameter("c", owner.value())
        .setParameter("id", id)
        .getResultList()
        .stream()
        .findFirst();
  }

  public Optional<RecipientAction> intent(CustomerId owner, String id) {
    return db.read(
        () -> row(owner, id).map(e -> json.readValue(e.snapshot, RecipientAction.class)));
  }

  public Optional<Recipient> result(CustomerId owner, String id) {
    return db.read(
        () ->
            row(owner, id)
                .filter(e -> e.result != null)
                .map(e -> json.readValue(e.result, Recipient.class)));
  }

  public void complete(CustomerId owner, String id, Recipient r) {
    var e = row(owner, id).orElseThrow();
    e.result = json.writeValueAsString(r);
    db.entityManager().flush();
  }
}
