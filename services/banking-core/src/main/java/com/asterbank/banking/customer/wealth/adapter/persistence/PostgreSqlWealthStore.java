package com.asterbank.banking.customer.wealth.adapter.persistence;

import com.asterbank.banking.customer.wealth.application.*;
import com.asterbank.banking.customer.wealth.domain.*;
import com.asterbank.banking.shared.adapter.persistence.DatabaseScope;
import com.asterbank.banking.shared.domain.*;
import java.sql.*;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;

public final class PostgreSqlWealthStore implements WealthStore {
  private final DatabaseScope db;
  private final JdbcTemplate sql;
  private final WealthPersistenceMapper mapper;
  private final TransactionTemplate writes;

  public PostgreSqlWealthStore(
      DatabaseScope db,
      JdbcTemplate sql,
      WealthPersistenceMapper mapper,
      PlatformTransactionManager tx) {
    this.db = db;
    this.sql = sql;
    this.mapper = mapper;
    writes = new TransactionTemplate(tx);
    writes.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
  }

  public <T> T read(Supplier<T> work) {
    return db.read(work);
  }

  public <T> T write(CustomerId owner, Supplier<T> work) {
    try {
      return writes.execute(
          s -> {
            db.lockOwnerForWrite(owner);
            return work.get();
          });
    } catch (WealthFailure | com.asterbank.banking.security.application.SecurityFailure e) {
      throw e;
    } catch (RuntimeException e) {
      throw new WealthFailure(WealthFailure.Code.PERSISTENCE_UNAVAILABLE);
    }
  }

  private String lock(String mode) {
    return TransactionSynchronizationManager.isCurrentTransactionReadOnly() ? "" : " FOR " + mode;
  }

  private OffsetDateTime time(ResultSet r, String k) throws SQLException {
    return r.getObject(k, OffsetDateTime.class);
  }

  private Money money(ResultSet r, String k) throws SQLException {
    return Money.of(r.getBigDecimal(k).toPlainString(), r.getString("currency"));
  }

  public List<InvestmentProduct> products(InvestmentProduct.Type type, RiskLevel risk) {
    return read(
        () ->
            sql.query(
                "SELECT * FROM investment_products WHERE (cast(? AS varchar) IS NULL OR type=?) AND (cast(? AS varchar) IS NULL OR risk_level=?) ORDER BY display_order,product_id COLLATE \"C\"",
                this::mapProduct,
                type == null ? null : type.name(),
                type == null ? null : type.name(),
                risk == null ? null : risk.name(),
                risk == null ? null : risk.name()));
  }

  public Optional<InvestmentProduct> product(String id) {
    return read(
        () ->
            sql
                .query(
                    "SELECT * FROM investment_products WHERE product_id=?" + lock("SHARE"),
                    this::mapProduct,
                    id)
                .stream()
                .findFirst());
  }

  private InvestmentProduct mapProduct(ResultSet r, int n) throws SQLException {
    return new InvestmentProduct(
        r.getString("product_id"),
        r.getString("display_name"),
        InvestmentProduct.Type.valueOf(r.getString("type")),
        RiskLevel.valueOf(r.getString("risk_level")),
        money(r, "minimum_investment"),
        InvestmentProduct.Status.valueOf(r.getString("status")),
        money(r, "fees"),
        r.getString("indicative_yield"),
        r.getString("performance_summary"),
        r.getString("liquidity"),
        r.getString("description"),
        r.getString("disclaimer"),
        r.getInt("business_version"));
  }

  public Optional<RiskProfile> risk(CustomerId owner) {
    return read(
        () ->
            sql
                .query(
                    "SELECT * FROM customer_risk_profiles WHERE customer_id=?" + lock("UPDATE"),
                    (r, n) ->
                        new RiskProfile(
                            owner,
                            r.getString("display_name"),
                            RiskLevel.valueOf(r.getString("risk_level")),
                            r.getInt("business_version"),
                            time(r, "assessed_at"),
                            time(r, "expires_at")),
                    owner.value())
                .stream()
                .findFirst());
  }

  public List<Position> positions(CustomerId owner) {
    return read(
        () ->
            sql.query(
                "SELECT * FROM portfolio_positions WHERE customer_id=? ORDER BY display_order,position_id COLLATE \"C\""
                    + lock("UPDATE"),
                (r, n) ->
                    new Position(
                        r.getString("position_id"),
                        owner,
                        r.getString("product_id"),
                        r.getString("display_name"),
                        InvestmentProduct.Type.valueOf(r.getString("type")),
                        money(r, "current_value"),
                        money(r, "invested_amount"),
                        money(r, "monthly_change"),
                        money(r, "monthly_net_contributions"),
                        r.getInt("business_version"),
                        time(r, "updated_at")),
                owner.value()));
  }

  public Optional<Suitability> suitability(CustomerId owner, String id) {
    return read(
        () ->
            sql
                .query(
                    "SELECT * FROM suitability_checks WHERE customer_id=? AND check_id=?"
                        + lock("UPDATE"),
                    (r, n) ->
                        new Suitability(
                            id,
                            owner,
                            r.getString("product_id"),
                            RiskLevel.valueOf(r.getString("user_risk_level")),
                            RiskLevel.valueOf(r.getString("product_risk_level")),
                            r.getInt("product_version"),
                            r.getInt("risk_profile_version"),
                            Suitability.Result.valueOf(r.getString("result")),
                            mapper.reasons(r.getString("reasons")),
                            time(r, "created_at"),
                            time(r, "expires_at")),
                    owner.value(),
                    id)
                .stream()
                .findFirst());
  }

  public void save(Suitability s) {
    sql.update(
        "INSERT INTO suitability_checks VALUES(?,?,?,?,?,?,?,?,cast(? AS jsonb),?,?)",
        s.id(),
        s.customerId().value(),
        s.productId(),
        s.userRiskLevel().name(),
        s.productRiskLevel().name(),
        s.productVersion(),
        s.riskProfileVersion(),
        s.result().name(),
        mapper.reasons(s.reasons()),
        s.createdAt(),
        s.expiresAt());
  }

  public Optional<InvestmentIntent> intent(CustomerId owner, String id) {
    return read(
        () ->
            sql
                .query(
                    "SELECT * FROM investment_order_intents WHERE customer_id=? AND intent_id=?"
                        + lock("UPDATE"),
                    (r, n) ->
                        new InvestmentIntent(
                            mapper.intent(r.getString("snapshot")),
                            r.getString("intent_hash"),
                            InvestmentIntent.Status.valueOf(r.getString("status"))),
                    owner.value(),
                    id)
                .stream()
                .findFirst());
  }

  public void save(InvestmentIntent i) {
    var t = i.terms();
    var owner = t.sourceAccount().customerId();
    var old = intent(owner, t.id());
    if (old.isPresent()) {
      var o = old.get();
      if (!o.terms().equals(t)
          || !o.intentHash().equals(i.intentHash())
          || (o.status() != InvestmentIntent.Status.PREPARED && o.status() != i.status()))
        throw new IllegalStateException("Immutable investment intent");
      sql.update(
          "UPDATE investment_order_intents SET status=? WHERE customer_id=? AND intent_id=?",
          i.status().name(),
          owner.value(),
          t.id());
    } else
      sql.update(
          "INSERT INTO investment_order_intents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,cast(? AS jsonb))",
          t.id(),
          owner.value(),
          t.product().id(),
          t.sourceAccount().id().value(),
          t.suitability().id(),
          t.amount().amount(),
          t.fees().amount(),
          t.totalDebit().amount(),
          t.amount().currency().getCurrencyCode(),
          i.status().name(),
          i.intentHash(),
          t.createdAt(),
          t.expiresAt(),
          mapper.intent(t));
  }

  public Optional<InvestmentOrder> order(CustomerId owner, String id) {
    return read(
        () ->
            sql
                .query(
                    "SELECT snapshot FROM investment_orders WHERE customer_id=? AND order_id=?",
                    (r, n) -> mapper.order(r.getString(1)),
                    owner.value(),
                    id)
                .stream()
                .findFirst());
  }

  public void save(InvestmentOrder o) {
    var t = o.terms();
    sql.update(
        "INSERT INTO investment_orders VALUES(?,?,?,?,?,?,?,?,cast(? AS jsonb))",
        o.id(),
        t.sourceAccount().customerId().value(),
        t.id(),
        t.sourceAccount().id().value(),
        o.transactionId(),
        o.positionId(),
        o.completedAt(),
        o.reference(),
        mapper.order(o));
  }

  public Optional<RedemptionIntent> redemptionIntent(CustomerId owner, String id) {
    return read(
        () ->
            sql
                .query(
                    "SELECT snapshot,intent_hash,status FROM investment_redemption_intents WHERE customer_id=? AND intent_id=?"
                        + lock("UPDATE"),
                    (r, n) ->
                        new RedemptionIntent(
                            mapper.redemptionIntent(r.getString("snapshot")),
                            r.getString("intent_hash"),
                            RedemptionIntent.Status.valueOf(r.getString("status"))),
                    owner.value(),
                    id)
                .stream()
                .findFirst());
  }

  public void save(RedemptionIntent intent) {
    var t = intent.terms();
    var owner = t.holding().customerId();
    var old = redemptionIntent(owner, t.id());
    if (old.isPresent()) {
      if (!old.get().terms().equals(t)
          || !old.get().intentHash().equals(intent.intentHash())
          || (old.get().status() != RedemptionIntent.Status.PREPARED
              && old.get().status() != intent.status()))
        throw new IllegalStateException("Immutable redemption intent");
      sql.update(
          "UPDATE investment_redemption_intents SET status=? WHERE customer_id=? AND intent_id=?",
          intent.status().name(),
          owner.value(),
          t.id());
    } else {
      sql.update(
          "INSERT INTO investment_redemption_intents(intent_id,customer_id,product_id,holding_id,destination_account_id,amount,currency,status,intent_hash,created_at,expires_at,snapshot) VALUES(?,?,?,?,?,?,?,?,?,?,?,cast(? AS jsonb))",
          t.id(),
          owner.value(),
          t.product().id(),
          t.holding().id(),
          t.destinationAccount().id().value(),
          t.amount().amount(),
          t.amount().currency().getCurrencyCode(),
          intent.status().name(),
          intent.intentHash(),
          t.createdAt(),
          t.expiresAt(),
          mapper.redemptionIntent(t));
    }
  }

  public Optional<RedemptionOrder> redemptionOrder(CustomerId owner, String id) {
    return read(
        () ->
            sql
                .query(
                    "SELECT snapshot FROM investment_redemption_orders WHERE customer_id=? AND order_id=?",
                    (r, n) -> mapper.redemptionOrder(r.getString(1)),
                    owner.value(),
                    id)
                .stream()
                .findFirst());
  }

  public void save(RedemptionOrder order) {
    var t = order.terms();
    sql.update(
        "INSERT INTO investment_redemption_orders(order_id,customer_id,intent_id,transaction_id,completed_at,reference,snapshot) VALUES(?,?,?,?,?,?,cast(? AS jsonb))",
        order.id(),
        t.holding().customerId().value(),
        t.id(),
        order.transactionId(),
        order.completedAt(),
        order.reference(),
        mapper.redemptionOrder(order));
  }

  public void save(Position p) {
    // Owner row is already locked. Expected version also protects accidental out-of-bound writes.
    var exists =
        sql.queryForList(
            "SELECT position_id FROM portfolio_positions WHERE customer_id=? AND position_id=?",
            p.customerId().value(),
            p.id());
    if (exists.isEmpty())
      sql.update(
          "INSERT INTO portfolio_positions VALUES(?,?,?,?,?,'CNY',?,?,?,?,?,?,100)",
          p.id(),
          p.customerId().value(),
          p.productId(),
          p.displayName(),
          p.type().name(),
          p.currentValue().amount(),
          p.investedAmount().amount(),
          p.monthlyChange().amount(),
          p.monthlyNetContributions().amount(),
          p.version(),
          p.asOf());
    else if (sql.update(
            "UPDATE portfolio_positions SET current_value=?,invested_amount=?,monthly_change=?,monthly_net_contributions=?,business_version=?,updated_at=? WHERE customer_id=? AND position_id=? AND business_version=?",
            p.currentValue().amount(),
            p.investedAmount().amount(),
            p.monthlyChange().amount(),
            p.monthlyNetContributions().amount(),
            p.version(),
            p.asOf(),
            p.customerId().value(),
            p.id(),
            p.version() - 1)
        != 1) throw new WealthFailure(WealthFailure.Code.INVESTMENT_STATE_CHANGED);
  }
}
