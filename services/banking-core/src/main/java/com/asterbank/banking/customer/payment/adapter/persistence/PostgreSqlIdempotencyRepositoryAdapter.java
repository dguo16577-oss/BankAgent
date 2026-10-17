package com.asterbank.banking.customer.payment.adapter.persistence;

import com.asterbank.banking.customer.payment.application.IdempotencyRepository;
import com.asterbank.banking.shared.adapter.persistence.DatabaseScope;
import java.time.*;
import java.util.*;

public final class PostgreSqlIdempotencyRepositoryAdapter implements IdempotencyRepository {
  private final DatabaseScope db;
  private final Clock clock;

  public PostgreSqlIdempotencyRepositoryAdapter(DatabaseScope db, Clock clock) {
    this.db = db;
    this.clock = clock;
  }

  public Optional<Completed> find(Scope scope) {
    return db.read(
        () -> {
          db.lockOwnerForWrite(scope.customer());
          var rows =
              db.entityManager()
                  .unwrap(org.hibernate.Session.class)
                  .createNativeQuery(
                      "select fingerprint,coalesce(transfer_id,card_action_id,recurring_action_id,investment_order_id,recipient_intent_id,schedule_intent_id,split_intent_id,redemption_order_id) from idempotency_records where customer_id=:c and operation=:op and idempotency_key=:k",
                      Object[].class)
                  .setParameter("c", scope.customer().value())
                  .setParameter("op", scope.operation())
                  .setParameter("k", scope.key())
                  .getResultList();
          return rows.stream()
              .findFirst()
              .map(row -> new Completed(scope, (String) row[0], (String) row[1]));
        });
  }

  public void save(Completed record) {
    var scope = record.scope();
    String receiptColumn =
        switch (scope.operation()) {
          case "SCHEDULE_ACTION" -> "schedule_intent_id";
          case "SPLIT_ACTION" -> "split_intent_id";
          case "EXECUTE_TRANSFER" -> "transfer_id";
          case "EXECUTE_CARD_ACTION" -> "card_action_id";
          case "EXECUTE_RECURRING_PAYMENT_ACTION" -> "recurring_action_id";
          case "EXECUTE_INVESTMENT_ORDER" -> "investment_order_id";
          case "EXECUTE_INVESTMENT_REDEMPTION" -> "redemption_order_id";
          case "RECIPIENT_CREATE", "RECIPIENT_DEACTIVATE" -> "recipient_intent_id";
          default -> throw new IllegalArgumentException("Unsupported idempotency operation");
        };
    db.entityManager()
        .unwrap(org.hibernate.Session.class)
        .createNativeQuery(
            "insert into idempotency_records(customer_id,operation,idempotency_key,fingerprint,status,"
                + receiptColumn
                + ",created_at,completed_at) values(:c,:op,:k,:f,'COMPLETED',:t,:time,:time)")
        .setParameter("c", scope.customer().value())
        .setParameter("op", scope.operation())
        .setParameter("k", scope.key())
        .setParameter("f", record.fingerprint())
        .setParameter("t", record.resourceId())
        .setParameter("time", OffsetDateTime.now(clock))
        .executeUpdate();
    db.entityManager().flush();
  }
}
