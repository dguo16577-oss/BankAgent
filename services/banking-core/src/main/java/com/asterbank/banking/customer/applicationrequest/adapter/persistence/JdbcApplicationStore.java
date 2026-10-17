package com.asterbank.banking.customer.applicationrequest.adapter.persistence;

import com.asterbank.banking.customer.applicationrequest.application.ApplicationStore;
import com.asterbank.banking.customer.applicationrequest.domain.*;
import com.asterbank.banking.shared.domain.*;
import java.sql.*;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

public final class JdbcApplicationStore implements ApplicationStore {
  private final JdbcTemplate db;
  private final tools.jackson.databind.ObjectMapper mapper;
  private final TransactionTemplate tx;

  public JdbcApplicationStore(
      JdbcTemplate db,
      PlatformTransactionManager manager,
      tools.jackson.databind.ObjectMapper mapper) {
    this.db = db;
    this.mapper = mapper;
    tx = new TransactionTemplate(manager);
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

  public void save(ApplicationIntent i) {
    db.update(
        "insert into application_intents(intent_id,customer_id,session_id,intent_hash,action_type,request_json,created_at,expires_at) values(?,?,?,?,?,?::jsonb,?,?)",
        i.id(),
        i.owner().value(),
        i.session(),
        i.hash(),
        i.action().name(),
        mapper.writeValueAsString(i.request()),
        Timestamp.from(i.createdAt()),
        Timestamp.from(i.expiresAt()));
  }

  public Optional<ApplicationIntent> intent(CustomerId owner, String id) {
    return db
        .query(
            "select * from application_intents where customer_id=? and intent_id=? for update",
            (r, n) ->
                new ApplicationIntent(
                    id,
                    owner,
                    r.getString("session_id"),
                    mapper.readValue(r.getString("request_json"), ApplicationRequest.class),
                    com.asterbank.banking.security.domain.VerificationAction.valueOf(
                        r.getString("action_type")),
                    r.getString("intent_hash"),
                    r.getTimestamp("created_at").toInstant(),
                    r.getTimestamp("expires_at").toInstant(),
                    r.getString("application_id"),
                    r.getString("authorization_id"),
                    ApplicationIntent.Status.valueOf(r.getString("status"))),
            owner.value(),
            id)
        .stream()
        .findFirst();
  }

  public void completeIntent(String id, String applicationId, String authorizationId) {
    db.update(
        "update application_intents set application_id=?,authorization_id=?,status='SUBMITTED' where intent_id=? and status='PREPARED'",
        applicationId,
        authorizationId,
        id);
  }

  public void cancelIntent(CustomerId owner, String id) {
    int rows =
        db.update(
            "update application_intents set status='CANCELLED' where customer_id=? and intent_id=? and status='PREPARED'",
            owner.value(),
            id);
    if (rows != 1)
      throw new ApplicationFailure(ApplicationFailure.Code.APPLICATION_INTENT_CANCELLED);
  }

  public Optional<Product> product(String id) {
    return db
        .query(
            "select title,item_type from public_catalog where id=?",
            (r, n) -> new Product(r.getString(1), r.getString(2)),
            id)
        .stream()
        .findFirst();
  }

  public List<ProductApplication> list(CustomerId owner) {
    return db.query(
        "select * from product_applications where customer_id=? order by submitted_at desc,application_id desc",
        this::map,
        owner.value());
  }

  public Optional<ProductApplication> find(CustomerId owner, String id) {
    return db
        .query(
            "select * from product_applications where customer_id=? and application_id=?",
            this::map,
            owner.value(),
            id)
        .stream()
        .findFirst();
  }

  public Optional<ProductApplication> replay(CustomerId owner, String key) {
    return db
        .query(
            "select * from product_applications where customer_id=? and idempotency_key=?",
            this::map,
            owner.value(),
            key)
        .stream()
        .findFirst();
  }

  public void save(ProductApplication a, String key) {
    var r = a.request();
    db.update(
        "insert into product_applications(application_id,customer_id,product_id,product_title,product_type,account_id,masked_account_number,contact_email,monthly_income,requested_amount,term_months,purpose,application_details,submitted_at,idempotency_key) values(?,?,?,?,?,?,?,?,?,?,?, ?,?::jsonb,?,?)",
        a.id(),
        a.owner().value(),
        r.productId(),
        a.productTitle(),
        a.productType(),
        r.accountId(),
        a.maskedAccountNumber(),
        r.contactEmail(),
        r.monthlyIncome() == null ? null : r.monthlyIncome().amount(),
        r.requestedAmount() == null ? null : r.requestedAmount().amount(),
        r.termMonths(),
        r.purpose(),
        mapper.writeValueAsString(r.applicationDetails()),
        a.submittedAt(),
        key);
  }

  private ProductApplication map(ResultSet r, int n) throws SQLException {
    var income = r.getBigDecimal("monthly_income");
    var amount = r.getBigDecimal("requested_amount");
    return new ProductApplication(
        r.getString("application_id"),
        new CustomerId(r.getString("customer_id")),
        r.getString("product_title"),
        r.getString("product_type"),
        r.getString("masked_account_number"),
        new ApplicationRequest(
            r.getString("product_id"),
            r.getString("account_id"),
            r.getString("contact_email"),
            true,
            income == null ? null : Money.of(income.toPlainString(), "CNY"),
            amount == null ? null : Money.of(amount.toPlainString(), "CNY"),
            (Integer) r.getObject("term_months"),
            r.getString("purpose"),
            mapper.readValue(r.getString("application_details"), ApplicationDetails.class)),
        r.getObject("submitted_at", OffsetDateTime.class));
  }
}
