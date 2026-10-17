package com.asterbank.banking.customer.card.adapter.persistence;

import com.asterbank.banking.customer.card.application.*;
import com.asterbank.banking.customer.card.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.math.BigDecimal;
import java.sql.*;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

public final class JdbcCreditLimitStore implements CreditLimitStore {
  private final JdbcTemplate db;
  private final TransactionTemplate tx;

  public JdbcCreditLimitStore(JdbcTemplate db, PlatformTransactionManager manager) {
    this.db = db;
    this.tx = new TransactionTemplate(manager);
  }

  public <T> T write(CustomerId owner, Supplier<T> work) {
    return tx.execute(
        s -> {
          db.queryForObject(
              "select customer_id from customers where customer_id=? for no key update",
              String.class,
              owner.value());
          return work.get();
        });
  }

  public BigDecimal currentLimit(CustomerId owner, String cardId) {
    return db.queryForObject(
        "select credit_limit from cards where customer_id=? and card_id=?",
        BigDecimal.class,
        owner.value(),
        cardId);
  }

  public void save(CreditLimitIntent i) {
    db.update(
        "insert into credit_limit_intents(intent_id,customer_id,session_id,card_id,current_limit,requested_limit,intent_hash,status,created_at,expires_at) values(?,?,?,?,?,?,?,?,?,?)",
        i.id(),
        i.customer().value(),
        i.sessionId(),
        i.cardId(),
        i.currentLimit(),
        i.requestedLimit(),
        i.intentHash(),
        i.status().name(),
        Timestamp.from(i.createdAt()),
        Timestamp.from(i.expiresAt()));
  }

  public Optional<CreditLimitIntent> intent(CustomerId owner, String id) {
    return db
        .query(
            "select * from credit_limit_intents where customer_id=? and intent_id=? for update",
            (r, n) ->
                new CreditLimitIntent(
                    r.getString("intent_id"),
                    owner,
                    r.getString("session_id"),
                    r.getString("card_id"),
                    r.getBigDecimal("current_limit"),
                    r.getBigDecimal("requested_limit"),
                    r.getString("intent_hash"),
                    CreditLimitIntent.Status.valueOf(r.getString("status")),
                    r.getTimestamp("created_at").toInstant(),
                    r.getTimestamp("expires_at").toInstant()),
            owner.value(),
            id)
        .stream()
        .findFirst();
  }

  public void transition(
      CustomerId owner, String id, CreditLimitIntent.Status from, CreditLimitIntent.Status to) {
    int changed =
        db.update(
            "update credit_limit_intents set status=? where customer_id=? and intent_id=? and status=?",
            to.name(),
            owner.value(),
            id,
            from.name());
    if (changed != 1)
      throw new CreditLimitFailure(CreditLimitFailure.Code.CREDIT_LIMIT_INTENT_CANCELLED);
  }

  public Optional<CreditLimitApplication> replay(CustomerId owner, String key) {
    return db
        .query(
            "select * from credit_limit_applications where customer_id=? and idempotency_key=?",
            this::map,
            owner.value(),
            key)
        .stream()
        .findFirst();
  }

  public void save(CreditLimitApplication a) {
    db.update(
        "insert into credit_limit_applications(application_id,customer_id,card_id,intent_id,current_limit,requested_limit,status,submitted_at,idempotency_key) values(?,?,?,?,?,?,?,?,?)",
        a.id(),
        a.customer().value(),
        a.cardId(),
        a.intentId(),
        a.currentLimit(),
        a.requestedLimit(),
        a.status().name(),
        Timestamp.from(a.submittedAt()),
        a.idempotencyKey());
  }

  public List<CreditLimitApplication> list(CustomerId owner) {
    return db.query(
        "select * from credit_limit_applications where customer_id=? order by submitted_at desc,application_id desc",
        this::map,
        owner.value());
  }

  public Optional<CreditLimitApplication> detail(CustomerId owner, String id) {
    return db
        .query(
            "select * from credit_limit_applications where customer_id=? and application_id=?",
            this::map,
            owner.value(),
            id)
        .stream()
        .findFirst();
  }

  private CreditLimitApplication map(ResultSet r, int row) throws SQLException {
    return new CreditLimitApplication(
        r.getString("application_id"),
        new CustomerId(r.getString("customer_id")),
        r.getString("card_id"),
        r.getString("intent_id"),
        r.getBigDecimal("current_limit"),
        r.getBigDecimal("requested_limit"),
        CreditLimitApplication.Status.valueOf(r.getString("status")),
        r.getTimestamp("submitted_at").toInstant(),
        r.getString("idempotency_key"));
  }
}
