package com.asterbank.banking.customer.transaction.adapter.persistence;

import com.asterbank.banking.customer.transaction.application.*;
import com.asterbank.banking.customer.transaction.domain.*;
import com.asterbank.banking.shared.adapter.persistence.DatabaseScope;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.function.Supplier;

public final class PostgreSqlTransactionRepositoryAdapter
    implements TransactionRepository, TransactionMutationPort {
  private final DatabaseScope db;

  public PostgreSqlTransactionRepositoryAdapter(DatabaseScope db) {
    this.db = db;
  }

  public <T> T read(Supplier<T> action) {
    return db.read(action);
  }

  public String snapshotRevision() {
    throw new UnsupportedOperationException("Customer scope required");
  }

  public String snapshotRevision(CustomerId c) {
    return read(
        () -> {
          var rows =
              db.entityManager()
                  .unwrap(org.hibernate.Session.class)
                  .createNativeQuery(
                      "select transaction_revision from customers where customer_id=:c", Long.class)
                  .setParameter("c", c.value())
                  .getResultList();
          return "pg-v1:" + (rows.isEmpty() ? 0 : rows.getFirst());
        });
  }

  public Optional<Transaction> find(CustomerId c, TransactionId id) {
    return read(
        () ->
            db
                .entityManager()
                .createQuery(
                    "from TransactionJpaEntity where transactionId=:id and customerId=:c",
                    TransactionJpaEntity.class)
                .setParameter("id", id.value())
                .setParameter("c", c.value())
                .getResultList()
                .stream()
                .findFirst()
                .map(TransactionPersistenceMapper::domain));
  }

  public List<Transaction> matching(CustomerId c, TransactionFilter f) {
    return select(c, f, null, false, 0);
  }

  public List<Transaction> window(CustomerId c, TransactionFilter f, CursorCodec.Anchor a) {
    return select(c, f, a, false, f.limit() + 1);
  }

  public boolean containsAnchor(CustomerId c, TransactionFilter f, CursorCodec.Anchor a) {
    return !select(c, f, a, true, 1).isEmpty();
  }

  private List<Transaction> select(
      CustomerId c, TransactionFilter f, CursorCodec.Anchor a, boolean exact, int limit) {
    return read(
        () -> {
          StringBuilder sql =
              new StringBuilder("select * from transactions where customer_id=:customer");
          Map<String, Object> params = new LinkedHashMap<>();
          params.put("customer", c.value());
          add(
              sql,
              params,
              "account_id",
              "account",
              f.accountId() == null ? null : f.accountId().value());
          add(sql, params, "card_id", "card", f.cardId() == null ? null : f.cardId().value());
          add(sql, params, "status", "status", f.status() == null ? null : f.status().name());
          add(
              sql,
              params,
              "direction",
              "direction",
              f.direction() == null ? null : f.direction().name());
          add(sql, params, "type", "type", f.type() == null ? null : f.type().name());
          add(
              sql,
              params,
              "category",
              "category",
              f.category() == null ? null : f.category().name());
          if (f.from() != null) {
            sql.append(" and occurred_at>=:fromTime");
            params.put("fromTime", f.from());
          }
          if (f.to() != null) {
            sql.append(" and occurred_at<:toTime");
            params.put("toTime", f.to());
          }
          if (!f.search().isEmpty()) {
            sql.append(
                " and (strpos(title_search,:search)>0 or strpos(merchant_search,:search)>0 or strpos(counterparty_search,:search)>0 or strpos(note_search,:search)>0)");
            params.put("search", f.search());
          }
          if (a != null) {
            sql.append(
                exact
                    ? " and occurred_at=:anchorTime and transaction_id=:anchorId"
                    : " and (occurred_at<:anchorTime or (occurred_at=:anchorTime and transaction_id>:anchorId))");
            params.put("anchorTime", OffsetDateTime.ofInstant(a.occurredAt(), ZoneOffset.UTC));
            params.put("anchorId", a.id().value());
          }
          sql.append(" order by occurred_at desc, transaction_id asc");
          var q =
              db.entityManager()
                  .unwrap(org.hibernate.Session.class)
                  .createNativeQuery(sql.toString(), TransactionJpaEntity.class);
          params.forEach(q::setParameter);
          if (limit > 0) q.setMaxResults(limit);
          return q.getResultList().stream().map(TransactionPersistenceMapper::domain).toList();
        });
  }

  private void add(
      StringBuilder sql, Map<String, Object> params, String column, String name, Object value) {
    if (value != null) {
      sql.append(" and ").append(column).append("=:").append(name);
      params.put(name, value);
    }
  }

  public void append(Transaction t) {
    db.lockOwnerForWrite(t.customerId());
    db.entityManager().persist(TransactionPersistenceMapper.entity(t));
    db.entityManager()
        .unwrap(org.hibernate.Session.class)
        .createNativeQuery(
            "update customers set transaction_revision=transaction_revision+1 where customer_id=:c")
        .setParameter("c", t.customerId().value())
        .executeUpdate();
    db.entityManager().flush();
  }
}
