package com.asterbank.banking.customer.card.adapter.persistence;

import com.asterbank.banking.customer.card.application.*;
import com.asterbank.banking.customer.card.domain.*;
import com.asterbank.banking.security.application.SecurityFailure;
import com.asterbank.banking.shared.adapter.persistence.DatabaseScope;
import com.asterbank.banking.shared.domain.CustomerId;
import jakarta.persistence.LockModeType;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;

public final class PostgreSqlCardStore implements CardStore {
  private final DatabaseScope db;
  private final CardSpringDataRepository cards;
  private final CardPersistenceMapper mapper;
  private final TransactionTemplate writes;

  public PostgreSqlCardStore(
      DatabaseScope db,
      CardSpringDataRepository cards,
      CardPersistenceMapper mapper,
      PlatformTransactionManager manager) {
    this.db = db;
    this.cards = cards;
    this.mapper = mapper;
    writes = new TransactionTemplate(manager);
    writes.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
  }

  public <T> T write(Supplier<T> work) {
    try {
      return writes.execute(s -> work.get());
    } catch (CardFailure | CardRuleViolation | SecurityFailure e) {
      throw e;
    } catch (RuntimeException e) {
      throw new CardFailure(CardFailure.Code.PERSISTENCE_UNAVAILABLE);
    }
  }

  public List<Card> cards(CustomerId owner) {
    return db.read(() -> cards.owned(owner.value()).stream().map(mapper::card).toList());
  }

  private boolean writing() {
    return !TransactionSynchronizationManager.isCurrentTransactionReadOnly();
  }

  public Optional<Card> card(CustomerId owner, String id) {
    return db.read(
        () -> {
          db.lockOwnerForWrite(owner);
          return (writing() ? cards.locked(owner.value(), id) : cards.owned(owner.value(), id))
              .map(mapper::card);
        });
  }

  public void save(Card card) {
    var e = cards.locked(card.customerId().value(), card.id()).orElseThrow();
    if (card.state().version() != e.businessVersion + 1)
      throw new CardFailure(CardFailure.Code.CARD_STATE_CHANGED);
    mapper.state(card, e);
    cards.saveAndFlush(e);
  }

  private Optional<CardActionIntentJpaEntity> intentEntity(CustomerId owner, String id) {
    var q =
        db.entityManager()
            .createQuery(
                "from CardActionIntentJpaEntity where customerId=:c and intentId=:id",
                CardActionIntentJpaEntity.class)
            .setParameter("c", owner.value())
            .setParameter("id", id);
    if (writing()) q.setLockMode(LockModeType.PESSIMISTIC_WRITE);
    return q.getResultList().stream().findFirst();
  }

  public Optional<CardActionIntent> intent(CustomerId owner, String id) {
    return db.read(
        () -> {
          db.lockOwnerForWrite(owner);
          return intentEntity(owner, id)
              .map(
                  e ->
                      new CardActionIntent(
                          mapper.intent(e.snapshot),
                          e.intentHash,
                          CardActionIntent.Status.valueOf(e.status)));
        });
  }

  public void save(CardActionIntent intent) {
    var t = intent.terms();
    var old = intentEntity(t.card().customerId(), t.id());
    if (old.isPresent()) {
      var e = old.get();
      if (!mapper.intent(e.snapshot).equals(t) || !e.intentHash.equals(intent.intentHash()))
        throw new IllegalStateException("Immutable card intent terms changed");
      if (!e.status.equals("PREPARED") && !e.status.equals(intent.status().name()))
        throw new IllegalStateException("Intent is terminal");
      e.status = intent.status().name();
    } else {
      var e = new CardActionIntentJpaEntity();
      e.intentId = t.id();
      e.customerId = t.card().customerId().value();
      e.cardId = t.card().id();
      e.actionType = t.actionType().name();
      e.status = intent.status().name();
      e.intentHash = intent.intentHash();
      e.riskDirection = t.change().risk().name();
      e.authorizationRequirement = t.change().authorization().name();
      e.beforeVersion = t.change().before().version();
      e.afterVersion = t.change().after().version();
      e.createdAt = t.createdAt();
      e.expiresAt = t.expiresAt();
      e.snapshot = mapper.intent(t);
      db.entityManager().persist(e);
    }
    db.entityManager().flush();
  }

  public Optional<CardAction> action(CustomerId owner, String id) {
    return db.read(
        () ->
            db
                .entityManager()
                .createQuery(
                    "from CardActionJpaEntity where customerId=:c and actionId=:id",
                    CardActionJpaEntity.class)
                .setParameter("c", owner.value())
                .setParameter("id", id)
                .getResultList()
                .stream()
                .findFirst()
                .map(e -> mapper.action(e.snapshot)));
  }

  public void save(CardAction a) {
    var e = new CardActionJpaEntity();
    e.actionId = a.id();
    e.customerId = a.card().customerId().value();
    e.cardId = a.card().id();
    e.intentId = a.terms().id();
    e.status = "COMPLETED";
    e.reference = a.reference();
    e.completedAt = a.completedAt();
    e.snapshot = mapper.action(a);
    db.entityManager().persist(e);
    db.entityManager().flush();
  }
}
