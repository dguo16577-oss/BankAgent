package com.asterbank.banking.shared.adapter.persistence;

import com.asterbank.banking.shared.application.CustomerProfileQuery;
import com.asterbank.banking.shared.domain.CustomerId;
import org.springframework.jdbc.core.JdbcTemplate;

public final class PostgreSqlCustomerProfileQuery implements CustomerProfileQuery {
  private final DatabaseScope db;
  private final JdbcTemplate sql;

  public PostgreSqlCustomerProfileQuery(DatabaseScope db, JdbcTemplate sql) {
    this.db = db;
    this.sql = sql;
  }

  public Profile profile(CustomerId owner) {
    return db.read(
        () ->
            sql.queryForObject(
                "SELECT display_name FROM customers WHERE customer_id=?",
                (r, n) -> new Profile(owner, r.getString(1)),
                owner.value()));
  }
}
