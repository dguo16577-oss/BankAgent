package com.asterbank.banking.customer.payment.adapter.persistence;

import com.asterbank.banking.customer.payment.application.ScheduleStore;
import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.shared.adapter.persistence.DatabaseScope;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

public final class PostgreSqlScheduleStore implements ScheduleStore {
  private final DatabaseScope db;
  private final ObjectMapper json;
  private final TransactionTemplate tx;

  public PostgreSqlScheduleStore(
      DatabaseScope db, ObjectMapper json, PlatformTransactionManager manager) {
    this.db = db;
    this.json = json;
    tx = new TransactionTemplate(manager);
    tx.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
  }

  public <T> T write(CustomerId c, Supplier<T> action) {
    return tx.execute(
        s -> {
          db.lockOwnerForWrite(c);
          return action.get();
        });
  }

  private org.hibernate.Session session() {
    return db.entityManager().unwrap(org.hibernate.Session.class);
  }

  public void lockRecipients(CustomerId c, List<String> ids) {
    for (var id : ids.stream().distinct().sorted().toList())
      session()
          .createNativeQuery(
              "select recipient_id from recipients where customer_id=:c and recipient_id=:id for update",
              String.class)
          .setParameter("c", c.value())
          .setParameter("id", id)
          .getResultList();
  }

  public void lockSchedule(CustomerId c, String id) {
    session()
        .createNativeQuery(
            "select schedule_id from scheduled_payments where customer_id=:c and schedule_id=:id for update",
            String.class)
        .setParameter("c", c.value())
        .setParameter("id", id)
        .getResultList();
  }

  public Optional<ScheduledPayment> find(CustomerId c, String id) {
    return db.read(
        () ->
            session()
                .createNativeQuery(
                    "select cast(snapshot as text) from scheduled_payments where customer_id=:c and schedule_id=:id",
                    String.class)
                .setParameter("c", c.value())
                .setParameter("id", id)
                .getResultStream()
                .findFirst()
                .map(s -> json.readValue(s, ScheduledPayment.class)));
  }

  public List<ScheduledPayment> list(CustomerId c) {
    return db.read(
        () ->
            session()
                .createNativeQuery(
                    "select cast(snapshot as text) from scheduled_payments where customer_id=:c order by case when status='SCHEDULED' then 0 else 1 end,due_at,schedule_id",
                    String.class)
                .setParameter("c", c.value())
                .getResultList()
                .stream()
                .map(s -> json.readValue(s, ScheduledPayment.class))
                .toList());
  }

  public List<ScheduledPayment> due(Instant now) {
    return db.read(
        () ->
            session()
                .createNativeQuery(
                    "select cast(snapshot as text) from scheduled_payments where status='SCHEDULED' and due_at<=:now order by due_at,schedule_id",
                    String.class)
                .setParameter("now", OffsetDateTime.ofInstant(now, ZoneOffset.UTC))
                .getResultList()
                .stream()
                .map(s -> json.readValue(s, ScheduledPayment.class))
                .toList());
  }

  public void save(ScheduledPayment p) {
    session()
        .createNativeMutationQuery(
            "insert into scheduled_payments(schedule_id,customer_id,source_account_id,recipient_id,amount,currency,due_at,status,version,snapshot,transfer_id,created_at,updated_at) values(:id,:c,:a,:r,:amount,:currency,:due,:status,:version,cast(:snapshot as jsonb),:transfer,:created,:updated) on conflict(schedule_id) do update set recipient_id=excluded.recipient_id,amount=excluded.amount,due_at=excluded.due_at,status=excluded.status,version=excluded.version,snapshot=excluded.snapshot,transfer_id=excluded.transfer_id,updated_at=excluded.updated_at")
        .setParameter("id", p.id())
        .setParameter("c", p.customerId().value())
        .setParameter("a", p.terms().sourceAccount().id().value())
        .setParameter("r", p.terms().recipient().id().value())
        .setParameter("amount", p.terms().amount().amount())
        .setParameter("currency", p.terms().amount().currency().getCurrencyCode())
        .setParameter("due", p.dueAt())
        .setParameter("status", p.status().name())
        .setParameter("version", p.version())
        .setParameter("snapshot", json.writeValueAsString(p))
        .setParameter("transfer", p.transferId())
        .setParameter("created", p.createdAt())
        .setParameter("updated", p.updatedAt())
        .executeUpdate();
  }

  public void save(ScheduleAction a) {
    session()
        .createNativeMutationQuery(
            "insert into scheduled_payment_intents(intent_id,customer_id,snapshot,created_at) values(:id,:c,cast(:s as jsonb),:at)")
        .setParameter("id", a.id())
        .setParameter("c", a.customerId().value())
        .setParameter("s", json.writeValueAsString(a))
        .setParameter("at", a.createdAt())
        .executeUpdate();
  }

  public Optional<ScheduleAction> intent(CustomerId c, String id) {
    return db.read(
        () ->
            session()
                .createNativeQuery(
                    "select cast(snapshot as text) from scheduled_payment_intents where customer_id=:c and intent_id=:id",
                    String.class)
                .setParameter("c", c.value())
                .setParameter("id", id)
                .getResultStream()
                .findFirst()
                .map(s -> json.readValue(s, ScheduleAction.class)));
  }

  public void lockIntent(CustomerId c, String id) {
    session()
        .createNativeQuery(
            "select intent_id from scheduled_payment_intents where customer_id=:c and intent_id=:id for update",
            String.class)
        .setParameter("c", c.value())
        .setParameter("id", id)
        .getResultList();
  }

  public boolean cancelled(CustomerId c, String id) {
    return db.read(
        () ->
            !session()
                .createNativeQuery(
                    "select intent_id from scheduled_payment_intents where customer_id=:c and intent_id=:id and status='CANCELLED'",
                    String.class)
                .setParameter("c", c.value())
                .setParameter("id", id)
                .getResultList()
                .isEmpty());
  }

  public boolean cancelIntent(CustomerId c, String id, OffsetDateTime at) {
    return session()
            .createNativeMutationQuery(
                "update scheduled_payment_intents set status='CANCELLED', cancelled_at=:at where customer_id=:c and intent_id=:id and status='PREPARED' and result is null")
            .setParameter("at", at)
            .setParameter("c", c.value())
            .setParameter("id", id)
            .executeUpdate()
        == 1;
  }

  public Optional<ScheduledPayment> result(CustomerId c, String id) {
    return db.read(
        () ->
            session()
                .createNativeQuery(
                    "select cast(result as text) from scheduled_payment_intents where customer_id=:c and intent_id=:id and result is not null",
                    String.class)
                .setParameter("c", c.value())
                .setParameter("id", id)
                .getResultStream()
                .findFirst()
                .map(s -> json.readValue(s, ScheduledPayment.class)));
  }

  public void complete(CustomerId c, String id, ScheduledPayment result) {
    session()
        .createNativeMutationQuery(
            "update scheduled_payment_intents set result=cast(:s as jsonb) where customer_id=:c and intent_id=:id and status='PREPARED' and result is null")
        .setParameter("s", json.writeValueAsString(result))
        .setParameter("c", c.value())
        .setParameter("id", id)
        .executeUpdate();
  }
}
