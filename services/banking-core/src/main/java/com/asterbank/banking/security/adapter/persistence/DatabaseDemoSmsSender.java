package com.asterbank.banking.security.adapter.persistence;

import com.asterbank.banking.security.application.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Simulated external delivery; never a source of verification truth. */
public final class DatabaseDemoSmsSender implements SmsSender {
  private final JdbcTemplate db;
  private final boolean enabled;
  private final boolean inbox;

  public DatabaseDemoSmsSender(JdbcTemplate db, boolean enabled, boolean inbox) {
    this.db = db;
    this.enabled = enabled;
    this.inbox = inbox;
  }

  public boolean available() {
    return enabled;
  }

  public boolean demoInboxAvailable() {
    return inbox;
  }

  public void send(String customer, String phone, String challenge, String code, Instant at) {
    if (!enabled) throw new SecurityFailure("VERIFICATION_UNAVAILABLE", 503);
    db.update(
        "insert into demo_sms_outbox(message_id,customer_id,phone_e164,challenge_id,message_body,created_at) values(?,?,?,?,?,?)",
        UUID.randomUUID().toString(),
        customer,
        phone,
        challenge,
        "Aster Bank: "
            + code
            + ". Valid for 5 minutes for this action only. Never share this code.",
        Timestamp.from(at));
  }
}
