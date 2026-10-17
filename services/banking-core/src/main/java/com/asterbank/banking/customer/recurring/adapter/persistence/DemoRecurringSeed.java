package com.asterbank.banking.customer.recurring.adapter.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Explicit deterministic seed; no discovery engine or TypeScript runtime dependency. */
public final class DemoRecurringSeed {
  private final JdbcTemplate sql;
  private final TransactionTemplate tx;

  public DemoRecurringSeed(JdbcTemplate sql, PlatformTransactionManager manager) {
    this.sql = sql;
    tx = new TransactionTemplate(manager);
  }

  public void initialize() {
    tx.executeWithoutResult(
        s -> {
          String[] names = {"Rent", "Netflix", "Spotify", "Adobe", "ChatGPT", "Bookshop"};
          for (int index = 0; index < names.length; index++) {
            String name = names[index];
            boolean detected = index == 5;
            String id = "rec_" + name.toLowerCase(java.util.Locale.ROOT);
            var existing =
                sql.queryForList(
                    "SELECT recurring_payment_id FROM recurring_payments WHERE recurring_payment_id=?",
                    id);
            if (!existing.isEmpty()) continue;
            var rows =
                sql.queryForList(
                    "SELECT * FROM transactions WHERE customer_id='usr_aster_alex' AND account_id='acc_current' AND title=? AND transaction_id IN (?,?,?) AND status='COMPLETED' ORDER BY occurred_at "
                        + (detected ? "ASC" : "DESC")
                        + ",transaction_id COLLATE \"C\"",
                    name,
                    detected ? "txn_jun_bookshop" : "txn_" + id,
                    detected ? "txn_jul_bookshop" : "txn_aug_" + id,
                    detected ? "txn_history_0_00" : null);
            if (rows.isEmpty()) continue;
            var first = rows.getFirst();
            var last = detected ? rows.getLast() : first;
            // Restrict deterministic evidence to known bank-owned historical seed records.
            sql.update(
                """
 INSERT INTO recurring_payments(recurring_payment_id,customer_id,display_name,type,status,frequency,source,management_capability,source_account_id,card_id,merchant_id,merchant_name,merchant_location,merchant_masked_number,usual_amount,currency,next_expected_at,last_paid_at,business_version,display_order,observed_occurrences,first_observed_at,last_observed_at)
 VALUES(?,'usr_aster_alex',?,?,'ACTIVE','MONTHLY',?,?,'acc_current',?,?,?,?,?,?,?,cast(? AS timestamptz)+interval '1 month',?,0,?,?,?,?) ON CONFLICT DO NOTHING
 """,
                id,
                name,
                detected
                    ? "DETECTED_RECURRING_PAYMENT"
                    : index == 0 ? "DIRECT_DEBIT" : "CARD_SUBSCRIPTION",
                detected ? "DETECTED_PATTERN" : "BANK_MANAGED",
                detected ? "NONE" : "STOP_FUTURE_PAYMENTS",
                first.get("card_id"),
                first.get("merchant_id"),
                first.get("merchant_name"),
                first.get("merchant_location"),
                first.get("merchant_masked_number"),
                first.get("amount"),
                first.get("currency"),
                detected ? null : last.get("occurred_at"),
                last.get("occurred_at"),
                index,
                detected ? rows.size() : null,
                detected ? first.get("occurred_at") : null,
                detected ? last.get("occurred_at") : null);
            for (int j = 0; j < rows.size(); j++)
              sql.update(
                  "INSERT INTO recurring_payment_transaction_links VALUES('usr_aster_alex',?,'acc_current',?,?,?) ON CONFLICT DO NOTHING",
                  id,
                  rows.get(j).get("transaction_id"),
                  j,
                  detected);
          }
        });
  }
}
