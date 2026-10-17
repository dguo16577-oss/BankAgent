package com.asterbank.banking.publiccontent.adapter.persistence;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Called only by local/test wiring; Flyway owns schema and this importer never updates existing
 * rows.
 */
public final class DemoPublicContentSeed {
  private final JdbcTemplate sql;
  private final TransactionTemplate tx;

  public DemoPublicContentSeed(JdbcTemplate sql, PlatformTransactionManager manager) {
    this.sql = sql;
    tx = new TransactionTemplate(manager);
  }

  public void initialize() throws IOException {
    var script =
        new ClassPathResource("demo/public-content.sql").getContentAsString(StandardCharsets.UTF_8);
    tx.executeWithoutResult(s -> sql.execute(script));
  }
}
