package com.asterbank.banking.customer.deposit;

import com.asterbank.banking.shared.domain.CustomerId;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("!unit")
public class DepositService {
  public record Holding(
      String id,
      String sourceAccountId,
      String depositAccountId,
      BigDecimal amount,
      int termMonths,
      BigDecimal annualRate,
      OffsetDateTime openedAt,
      OffsetDateTime maturesAt,
      String status) {}

  private final JdbcTemplate db;
  private final Clock clock;

  public DepositService(JdbcTemplate db, Clock clock) {
    this.db = db;
    this.clock = clock;
  }

  @Transactional
  public String openCurrencyAccount(CustomerId customer, String currency) {
    if (!List.of("USD", "JPY", "EUR", "GBP", "HKD", "AUD", "SGD").contains(currency))
      throw new DepositFailure("INVALID_REQUEST", 400);
    lockCustomer(customer);
    Integer existing =
        db.queryForObject(
            "select count(*) from accounts where customer_id=? and currency=? and account_type='MULTI_CURRENCY' and status='ACTIVE'",
            Integer.class,
            customer.value(),
            currency);
    if (existing != null && existing > 0)
      throw new DepositFailure("CURRENCY_ACCOUNT_ALREADY_OPEN", 409);
    var rate =
        db.queryForObject(
            "select value from public_rates where id=? and kind='FX'",
            BigDecimal.class,
            currency.toLowerCase(java.util.Locale.ROOT) + "-cny");
    var asOf =
        db.queryForObject(
            "select as_of from public_rate_set where id='reference'", OffsetDateTime.class);
    if (rate == null || asOf == null) throw new DepositFailure("INVALID_REQUEST", 400);
    String id = "acct_" + UUID.randomUUID();
    String lastFour = String.format("%04d", Math.floorMod(UUID.randomUUID().hashCode(), 10000));
    var now = now();
    db.update(
        """
        insert into accounts (account_id, customer_id, display_name, account_type, status,
          currency, balance, pending_amount, masked_identifier, opened_at,
          equivalent_amount, equivalent_currency, exchange_rate, conversion_as_of)
        values (?, ?, ?, 'MULTI_CURRENCY', 'ACTIVE', ?, 0, 0, ?, ?, 0, 'CNY', ?, ?)
        """,
        id,
        customer.value(),
        currency + " Account",
        currency,
        "•••• " + lastFour,
        now,
        rate,
        asOf);
    db.update("update customers set account_as_of=? where customer_id=?", now, customer.value());
    return id;
  }

  @Transactional
  public Holding openTimeDeposit(
      CustomerId customer, String sourceId, String amountText, String key) {
    if (key == null || !key.matches("[A-Za-z0-9_-]{1,128}"))
      throw new DepositFailure("INVALID_REQUEST", 400);
    if (sourceId == null
        || sourceId.isBlank()
        || amountText == null
        || !amountText.matches("(0|[1-9][0-9]*)\\.[0-9]{2}"))
      throw new DepositFailure("INVALID_REQUEST", 400);
    BigDecimal amount;
    try {
      amount = new BigDecimal(amountText);
    } catch (NumberFormatException invalid) {
      throw new DepositFailure("INVALID_AMOUNT", 400);
    }
    if (amount.signum() <= 0 || amount.compareTo(new BigDecimal("1000000.00")) > 0)
      throw new DepositFailure("INVALID_AMOUNT", 400);
    lockCustomer(customer);
    var previous =
        db.query(
            "select * from time_deposits where customer_id=? and idempotency_key=?",
            (rs, n) -> holding(rs),
            customer.value(),
            key);
    if (!previous.isEmpty()) {
      var old = previous.getFirst();
      if (!old.sourceAccountId().equals(sourceId) || old.amount().compareTo(amount) != 0)
        throw new DepositFailure("IDEMPOTENCY_KEY_REUSED", 409);
      return old;
    }
    var sources =
        db.queryForList(
            """
        select account_type, status, currency, balance, pending_amount from accounts
        where customer_id=? and account_id=? for update
        """,
            customer.value(),
            sourceId);
    if (sources.isEmpty()) throw new DepositFailure("ACCOUNT_NOT_FOUND", 404);
    Map<String, Object> source = sources.getFirst();
    if (!List.of("CURRENT", "SAVINGS").contains(source.get("account_type"))
        || !"ACTIVE".equals(source.get("status"))
        || !"CNY".equals(source.get("currency")))
      throw new DepositFailure("TIME_DEPOSIT_NOT_ELIGIBLE", 409);
    var available =
        ((BigDecimal) source.get("balance")).subtract((BigDecimal) source.get("pending_amount"));
    if (available.compareTo(amount) < 0) throw new DepositFailure("INSUFFICIENT_FUNDS", 409);
    var rate =
        db.queryForObject(
            "select value from public_rates where id='deposit' and kind='TIME_DEPOSIT'",
            BigDecimal.class);
    if (rate == null) throw new DepositFailure("TIME_DEPOSIT_NOT_ELIGIBLE", 409);
    var now = now();
    var maturity = now.plusMonths(12);
    String depositId = "dep_" + UUID.randomUUID();
    String accountId = "acct_" + UUID.randomUUID();
    String lastFour = String.format("%04d", Math.floorMod(UUID.randomUUID().hashCode(), 10000));
    db.update(
        "update accounts set balance=balance-? where customer_id=? and account_id=?",
        amount,
        customer.value(),
        sourceId);
    db.update(
        """
        insert into accounts (account_id, customer_id, display_name, account_type, status,
          currency, balance, pending_amount, masked_identifier, opened_at)
        values (?, ?, '12-month Time Deposit', 'TIME_DEPOSIT', 'ACTIVE', 'CNY', ?, 0, ?, ?)
        """,
        accountId,
        customer.value(),
        amount,
        "•••• " + lastFour,
        now);
    db.update(
        """
        insert into time_deposits (deposit_id, customer_id, source_account_id, deposit_account_id,
          amount, currency, term_months, annual_rate, opened_at, matures_at, status, idempotency_key)
        values (?, ?, ?, ?, ?, 'CNY', 12, ?, ?, ?, 'ACTIVE', ?)
        """,
        depositId,
        customer.value(),
        sourceId,
        accountId,
        amount,
        rate,
        now,
        maturity,
        key);
    transaction(customer, sourceId, "Open 12-month time deposit", amount, "DEBIT", now, depositId);
    transaction(customer, accountId, "Time deposit principal", amount, "CREDIT", now, depositId);
    db.update(
        "update customers set account_as_of=?, transaction_revision=transaction_revision+2 where customer_id=?",
        now,
        customer.value());
    return new Holding(depositId, sourceId, accountId, amount, 12, rate, now, maturity, "ACTIVE");
  }

  @Transactional(readOnly = true)
  public List<Holding> list(CustomerId customer) {
    return db.query(
        "select * from time_deposits where customer_id=? order by opened_at desc, deposit_id",
        (rs, n) -> holding(rs),
        customer.value());
  }

  private Holding holding(java.sql.ResultSet rs) throws java.sql.SQLException {
    return new Holding(
        rs.getString("deposit_id"),
        rs.getString("source_account_id"),
        rs.getString("deposit_account_id"),
        rs.getBigDecimal("amount"),
        rs.getInt("term_months"),
        rs.getBigDecimal("annual_rate"),
        rs.getObject("opened_at", OffsetDateTime.class),
        rs.getObject("matures_at", OffsetDateTime.class),
        rs.getString("status"));
  }

  private void lockCustomer(CustomerId customer) {
    var ids =
        db.queryForList(
            "select customer_id from customers where customer_id=? for no key update",
            String.class,
            customer.value());
    if (ids.isEmpty()) throw new DepositFailure("UNAUTHENTICATED", 401);
  }

  private void transaction(
      CustomerId customer,
      String accountId,
      String title,
      BigDecimal amount,
      String direction,
      OffsetDateTime time,
      String reference) {
    db.update(
        """
        insert into transactions (transaction_id, customer_id, account_id, title, amount, currency,
          direction, status, type, category, occurred_at, booked_at, reference, title_search)
        values (?, ?, ?, ?, ?, 'CNY', ?, 'COMPLETED', 'BANK_TRANSFER', 'TRANSFER', ?, ?, ?, ?)
        """,
        "txn_" + UUID.randomUUID(),
        customer.value(),
        accountId,
        title,
        amount,
        direction,
        time,
        time,
        reference,
        title.toLowerCase(java.util.Locale.ROOT));
  }

  private OffsetDateTime now() {
    return OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC).truncatedTo(ChronoUnit.MICROS);
  }
}
