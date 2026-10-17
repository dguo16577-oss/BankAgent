package com.asterbank.banking.customer.card.adapter.persistence;

import com.asterbank.banking.customer.card.application.CardAuthorizationStore;
import com.asterbank.banking.customer.card.domain.CardAuthorization;
import com.asterbank.banking.shared.domain.CustomerId;
import java.math.BigDecimal;
import java.sql.*;
import java.time.*;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;

public final class JdbcCardAuthorizationStore implements CardAuthorizationStore {
  private final JdbcTemplate db;

  public JdbcCardAuthorizationStore(JdbcTemplate db) {
    this.db = db;
  }

  public Optional<CardAuthorization> find(CustomerId owner, String requestKey) {
    return db
        .query(
            "select * from card_authorizations where customer_id=? and request_key=?",
            this::map,
            owner.value(),
            requestKey)
        .stream()
        .findFirst();
  }

  public BigDecimal approvedAmount(CustomerId owner, String cardId, Instant start, Instant end) {
    return db.queryForObject(
        "select coalesce(sum(amount),0) from card_authorizations where customer_id=? and card_id=? and status='APPROVED' and authorized_at>=? and authorized_at<?",
        BigDecimal.class,
        owner.value(),
        cardId,
        Timestamp.from(start),
        Timestamp.from(end));
  }

  public BigDecimal creditLimit(CustomerId owner, String cardId) {
    return db.queryForObject(
        "select credit_limit from cards where customer_id=? and card_id=?",
        BigDecimal.class,
        owner.value(),
        cardId);
  }

  public void save(CardAuthorization d) {
    db.update(
        "insert into card_authorizations(authorization_id,customer_id,card_id,request_key,request_hash,amount,currency,channel,international,status,reason,authorized_at) values(?,?,?,?,?,?,'CNY',?,?,?,?,?)",
        d.id(),
        d.customer().value(),
        d.cardId(),
        d.requestKey(),
        d.requestHash(),
        d.amount(),
        d.channel().name(),
        d.international(),
        d.status().name(),
        d.reason().name(),
        d.authorizedAt());
  }

  private CardAuthorization map(ResultSet r, int row) throws SQLException {
    return new CardAuthorization(
        r.getString("authorization_id"),
        new CustomerId(r.getString("customer_id")),
        r.getString("card_id"),
        r.getBigDecimal("amount"),
        CardAuthorization.Channel.valueOf(r.getString("channel")),
        r.getBoolean("international"),
        CardAuthorization.Status.valueOf(r.getString("status")),
        CardAuthorization.Reason.valueOf(r.getString("reason")),
        r.getObject("authorized_at", OffsetDateTime.class),
        r.getString("request_key"),
        r.getString("request_hash"));
  }
}
