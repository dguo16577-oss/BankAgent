package com.asterbank.banking.customer.card.adapter.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Independent Java reproduction of M5 initial fixtures; no TypeScript runtime dependency. */
public final class DemoCardSeed {
  private final JdbcTemplate db;
  private final TransactionTemplate tx;

  public DemoCardSeed(JdbcTemplate db, PlatformTransactionManager manager) {
    this.db = db;
    this.tx = new TransactionTemplate(manager);
  }

  public void initialize() {
    tx.executeWithoutResult(
        s -> {
          insert(
              "card_aster_debit",
              "usr_aster_alex",
              "Visa Debit",
              "••8821",
              "VISA",
              "DEBIT",
              "acc_current",
              0);
          insert(
              "card_aster_credit",
              "usr_aster_alex",
              "Mastercard Credit",
              "••1937",
              "MASTERCARD",
              "CREDIT",
              "acc_current",
              1);
          // Other customer exists only in explicit test data; never creates a runtime identity.
          insert(
              "card_other",
              "customer_other",
              "Other Visa Debit",
              "••9900",
              "VISA",
              "DEBIT",
              "acc_other",
              0);
        });
  }

  private void insert(
      String id,
      String customer,
      String name,
      String masked,
      String scheme,
      String type,
      String account,
      int order) {
    db.update(
        "insert into cards(card_id,customer_id,display_name,masked_number,scheme,card_type,status,linked_account_id,linked_account_name,linked_account_masked_number,online_payments,international_payments,atm_withdrawals,contactless,business_version,row_version,display_order,updated_at,credit_limit) select ?,a.customer_id,?,?,?,?,'ACTIVE',a.account_id,a.display_name,a.masked_identifier,true,true,true,true,0,0,?,TIMESTAMPTZ '2026-09-27 10:30:00+08',? from accounts a where a.account_id=? and a.customer_id=? on conflict(card_id) do nothing",
        id,
        name,
        masked,
        scheme,
        type,
        order,
        type.equals("CREDIT") ? new java.math.BigDecimal("20000.00") : null,
        account,
        customer);
  }
}
