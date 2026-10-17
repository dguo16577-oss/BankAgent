package com.asterbank.banking.customer.wealth.adapter.persistence;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Locale;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Local/test reference fixtures. Never overwrite persistent customer state on restart. */
public final class DemoWealthSeed {
  private final JdbcTemplate sql;
  private final TransactionTemplate tx;

  public DemoWealthSeed(JdbcTemplate sql, PlatformTransactionManager manager) {
    this.sql = sql;
    tx = new TransactionTemplate(manager);
  }

  public void initialize() {
    tx.executeWithoutResult(
        s -> {
          String[] ids = {"cash", "bond", "balanced", "equity"},
              names =
                  {
                    "Aster Cash Reserve",
                    "Aster Stable Bond",
                    "Aster Balanced Growth",
                    "Aster Equity Select"
                  },
              types = {"MONEY_MARKET", "BOND_FUND", "BALANCED_FUND", "EQUITY_FUND"},
              mins = {"100", "1000", "1000", "2000"},
              yields = {"1.80", "2.60", "3.40", "4.20"};
          for (int n = 0; n < 4; n++)
            sql.update(
                "INSERT INTO investment_products VALUES(?,?,?,?,'CNY',?,0,'AVAILABLE',?,?,?,?,?,0,?) ON CONFLICT DO NOTHING",
                "product_" + ids[n],
                names[n],
                types[n],
                "R" + (n + 1),
                new BigDecimal(mins[n]),
                yields[n],
                "Illustrative annual yield for this demo only. It is not a forecast or promised return.",
                "Simulated purchase and redemption settle immediately at the displayed cost-addition value; no live NAV is available.",
                "A fictional "
                    + types[n].toLowerCase(Locale.ROOT).replace('_', ' ')
                    + " used to demonstrate suitability and an investment order.",
                "SIMULATED PRODUCT · No real investment is placed. Capital and returns are not guaranteed. The displayed figures are demo values, not financial advice.",
                n);
          sql.update(
              "UPDATE investment_products SET liquidity=? WHERE product_id IN ('product_cash','product_bond','product_balanced','product_equity') AND liquidity=?",
              "Simulated purchase and redemption settle immediately at the displayed cost-addition value; no live NAV is available.",
              "Simulated purchase completes immediately. Redemption is not available in this demo.");
          // Test-only second customer may be installed explicitly by integration fixtures.
          sql.update(
              "INSERT INTO customer_risk_profiles SELECT customer_id,CASE WHEN customer_id='usr_aster_alex' THEN 'Alex Chen' ELSE 'Other Customer' END,'R2',0,'2026-09-01T09:00:00+08:00'::timestamptz,'2027-09-01T09:00:00+08:00'::timestamptz FROM customers WHERE customer_id IN ('usr_aster_alex','customer_other') ON CONFLICT DO NOTHING");
          if (sql.queryForObject(
                  "SELECT count(*) FROM customers WHERE customer_id='usr_aster_alex'",
                  Integer.class)
              == 0) return;
          String[] holding = {"holding_market", "holding_bond", "holding_cash"},
              product = {"product_cash", "product_bond", null},
              labels = {"Money Market", "Bond Fund", "Cash Management"},
              values = {"10000", "5320", "3000"},
              cost = {"10000", "5100", "3000"};
          for (int n = 0; n < 3; n++)
            sql.update(
                "INSERT INTO portfolio_positions VALUES(?,'usr_aster_alex',?,?,?,'CNY',?,?,?,0,0,?,?) ON CONFLICT DO NOTHING",
                holding[n],
                product[n],
                labels[n],
                n == 1 ? "BOND_FUND" : "MONEY_MARKET",
                new BigDecimal(values[n]),
                new BigDecimal(cost[n]),
                new BigDecimal(n == 1 ? "220" : "0"),
                OffsetDateTime.parse("2026-09-27T10:30:00+08:00"),
                n);
        });
  }
}
