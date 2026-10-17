package com.asterbank.banking.customer.recurring.adapter.persistence;

import static com.asterbank.banking.customer.recurring.domain.RecurringFailure.Code.*;

import com.asterbank.banking.customer.recurring.application.*;
import com.asterbank.banking.customer.recurring.domain.*;
import com.asterbank.banking.customer.transaction.domain.Merchant;
import com.asterbank.banking.shared.adapter.persistence.DatabaseScope;
import com.asterbank.banking.shared.domain.*;
import java.sql.*;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;

public final class PostgreSqlRecurringStore implements RecurringStore, RecurringUpcomingQuery {
  public List<RecurringUpcomingQuery.Upcoming> upcoming(
      CustomerId owner, OffsetDateTime asOf, int limit) {
    if (limit < 1 || limit > 50) throw new IllegalArgumentException("Invalid upcoming limit");
    return read(
        () ->
            sql.query(
                "SELECT recurring_payment_id,display_name,next_expected_at,usual_amount,currency FROM recurring_payments WHERE customer_id=? AND status='ACTIVE' AND source='BANK_MANAGED' AND next_expected_at>? ORDER BY next_expected_at,recurring_payment_id COLLATE \"C\" LIMIT ?",
                (r, n) ->
                    new RecurringUpcomingQuery.Upcoming(
                        r.getString(1),
                        r.getString(2),
                        r.getObject(3, OffsetDateTime.class),
                        Money.of(r.getBigDecimal(4).toPlainString(), r.getString(5))),
                owner.value(),
                asOf,
                limit));
  }

  private final DatabaseScope db;
  private final JdbcTemplate sql;
  private final RecurringPersistenceMapper mapper;
  private final TransactionTemplate writes;

  public PostgreSqlRecurringStore(
      DatabaseScope db,
      JdbcTemplate sql,
      RecurringPersistenceMapper mapper,
      PlatformTransactionManager manager) {
    this.db = db;
    this.sql = sql;
    this.mapper = mapper;
    writes = new TransactionTemplate(manager);
    writes.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
  }

  public <T> T read(Supplier<T> work) {
    return db.read(work);
  }

  public <T> T write(Supplier<T> work) {
    try {
      return writes.execute(s -> work.get());
    } catch (RecurringFailure | com.asterbank.banking.security.application.SecurityFailure e) {
      throw e;
    } catch (RuntimeException e) {
      throw new RecurringFailure(PERSISTENCE_UNAVAILABLE);
    }
  }

  private String lock() {
    return TransactionSynchronizationManager.isCurrentTransactionReadOnly() ? "" : " FOR UPDATE";
  }

  public List<RecurringPayment> list(CustomerId owner) {
    return read(
        () -> {
          // Fetch the owner's links once; do not query once per payment row.
          Map<String, List<Link>> linksByPayment = new HashMap<>();
          sql.query(
              "SELECT recurring_payment_id,transaction_id,matched FROM recurring_payment_transaction_links WHERE customer_id=? ORDER BY recurring_payment_id,position",
              (org.springframework.jdbc.core.RowCallbackHandler)
                  r ->
                      linksByPayment
                          .computeIfAbsent(r.getString(1), ignored -> new ArrayList<>())
                          .add(new Link(r.getString(2), r.getBoolean(3))),
              owner.value());
          return sql.query(
              "SELECT * FROM recurring_payments WHERE customer_id=? ORDER BY display_order,recurring_payment_id COLLATE \"C\"",
              (r, n) ->
                  payment(
                      r,
                      linksByPayment.getOrDefault(r.getString("recurring_payment_id"), List.of())),
              owner.value());
        });
  }

  public Optional<RecurringPayment> payment(CustomerId owner, String id) {
    return read(
        () -> {
          db.lockOwnerForWrite(owner);
          return sql
              .query(
                  "SELECT * FROM recurring_payments WHERE customer_id=? AND recurring_payment_id=?"
                      + lock(),
                  this::payment,
                  owner.value(),
                  id)
              .stream()
              .findFirst();
        });
  }

  private RecurringPayment payment(ResultSet r, int n) throws SQLException {
    var owner = new CustomerId(r.getString("customer_id"));
    var id = r.getString("recurring_payment_id");
    var links =
        sql.query(
            "SELECT transaction_id,matched FROM recurring_payment_transaction_links WHERE customer_id=? AND recurring_payment_id=? ORDER BY position",
            (x, i) -> new Link(x.getString(1), x.getBoolean(2)),
            owner.value(),
            id);
    return payment(r, links);
  }

  private RecurringPayment payment(ResultSet r, List<Link> links) throws SQLException {
    var owner = new CustomerId(r.getString("customer_id"));
    var id = r.getString("recurring_payment_id");
    var matched = links.stream().filter(Link::matched).map(Link::id).toList();
    var merchant =
        r.getString("merchant_id") == null
            ? null
            : new Merchant(
                r.getString("merchant_id"),
                r.getString("merchant_name"),
                r.getString("merchant_location"),
                r.getString("merchant_masked_number"));
    var provenance =
        r.getObject("observed_occurrences") == null
            ? null
            : new RecurringPayment.Provenance(
                matched,
                r.getInt("observed_occurrences"),
                time(r, "first_observed_at"),
                time(r, "last_observed_at"));
    return new RecurringPayment(
        id,
        owner,
        r.getString("display_name"),
        RecurringPayment.Type.valueOf(r.getString("type")),
        RecurringPayment.Status.valueOf(r.getString("status")),
        RecurringPayment.Frequency.valueOf(r.getString("frequency")),
        RecurringPayment.Source.valueOf(r.getString("source")),
        r.getString("source_account_id"),
        r.getString("card_id"),
        merchant,
        Money.of(r.getBigDecimal("usual_amount").toPlainString(), r.getString("currency")),
        time(r, "next_expected_at"),
        time(r, "last_paid_at"),
        RecurringPayment.Capability.valueOf(r.getString("management_capability")),
        r.getInt("business_version"),
        links.stream().map(Link::id).toList(),
        provenance);
  }

  private record Link(String id, boolean matched) {}

  private OffsetDateTime time(ResultSet r, String key) throws SQLException {
    return r.getObject(key, OffsetDateTime.class);
  }

  public void save(RecurringPayment p) {
    int n =
        sql.update(
            "UPDATE recurring_payments SET status=?,next_expected_at=?,business_version=? WHERE customer_id=? AND recurring_payment_id=? AND business_version=?",
            p.status().name(),
            p.nextExpectedAt(),
            p.version(),
            p.customerId().value(),
            p.id(),
            p.version() - 1);
    if (n != 1) throw new RecurringFailure(RECURRING_PAYMENT_STATE_CHANGED);
    if (p.status() == RecurringPayment.Status.STOPPED) {
      sql.update(
          "UPDATE renewal_reminders SET status='CANCELLED',version=version+1,updated_at=now() WHERE customer_id=? AND recurring_payment_id=? AND status='ACTIVE'",
          p.customerId().value(),
          p.id());
    }
  }

  public Optional<RecurringIntent> intent(CustomerId owner, String id) {
    return read(
        () -> {
          db.lockOwnerForWrite(owner);
          return sql
              .query(
                  "SELECT * FROM recurring_payment_action_intents WHERE customer_id=? AND intent_id=?"
                      + lock(),
                  (r, n) ->
                      new RecurringIntent(
                          mapper.intent(r.getString("snapshot")),
                          r.getString("intent_hash"),
                          RecurringIntent.Status.valueOf(r.getString("status"))),
                  owner.value(),
                  id)
              .stream()
              .findFirst();
        });
  }

  public void save(RecurringIntent i) {
    var t = i.terms();
    var owner = t.payment().customerId();
    var old = intent(owner, t.id());
    if (old.isPresent()) {
      var o = old.get();
      if (!o.terms().equals(t) || !o.intentHash().equals(i.intentHash()))
        throw new IllegalStateException("Immutable intent changed");
      if (o.status() != RecurringIntent.Status.PREPARED && o.status() != i.status())
        throw new IllegalStateException("Terminal intent");
      sql.update(
          "UPDATE recurring_payment_action_intents SET status=? WHERE customer_id=? AND intent_id=?",
          i.status().name(),
          owner.value(),
          t.id());
    } else
      sql.update(
          "INSERT INTO recurring_payment_action_intents VALUES(?,?,?,?,?,?,?,cast(? AS jsonb))",
          t.id(),
          owner.value(),
          t.payment().id(),
          i.status().name(),
          i.intentHash(),
          t.createdAt(),
          t.expiresAt(),
          mapper.intent(t));
  }

  public Optional<RecurringAction> action(CustomerId owner, String id) {
    return read(
        () ->
            sql
                .query(
                    "SELECT snapshot FROM recurring_payment_actions WHERE customer_id=? AND action_id=?",
                    (r, n) -> mapper.action(r.getString(1)),
                    owner.value(),
                    id)
                .stream()
                .findFirst());
  }

  public void save(RecurringAction a) {
    sql.update(
        "INSERT INTO recurring_payment_actions VALUES(?,?,?,?,?,?,cast(? AS jsonb))",
        a.id(),
        a.payment().customerId().value(),
        a.payment().id(),
        a.terms().id(),
        a.effectiveAt(),
        a.reference(),
        mapper.action(a));
  }
}
