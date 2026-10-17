package com.asterbank.banking.security.adapter.security;

import com.asterbank.banking.shared.adapter.persistence.DemoDataInitializer;
import com.asterbank.banking.shared.config.DemoSeed;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
@Profile("(local | test | demo) & !unit & !prod")
public final class DemoCredentialSeed implements ApplicationRunner {
  private final JdbcTemplate db;
  private final PasswordEncoder encoder;
  private final DemoDataInitializer seed;
  private final ObjectMapper mapper;

  public DemoCredentialSeed(
      JdbcTemplate db, PasswordEncoder encoder, DemoDataInitializer seed, ObjectMapper mapper) {
    this.db = db;
    this.encoder = encoder;
    this.seed = seed;
    this.mapper = mapper;
  }

  public void run(ApplicationArguments args) throws java.io.IOException {
    seed.initializeDemo(DemoSeed.load(mapper));
    db.update(
        "insert into customer_credentials(customer_id,email,password_hash) values(?,?,?) on conflict(customer_id) do nothing",
        "usr_aster_alex",
        "alex@aster.local",
        encoder.encode("demo-password"));
    db.update(
        "insert into customer_credentials(customer_id,email,password_hash) values(?,?,?) on conflict(customer_id) do nothing",
        "usr_aster_lin",
        "lin@aster.local",
        encoder.encode("demo-password"));
    for (String person : java.util.List.of("zhang", "li", "wang_chen", "wang_qiang"))
      db.update(
          "insert into customer_credentials(customer_id,email,password_hash) values(?,?,?) on conflict(customer_id) do nothing",
          "usr_aster_" + person,
          person + "@aster.local",
          encoder.encode("demo-password"));
    for (String customer :
        db.queryForList("select customer_id from customers order by customer_id", String.class)) {
      String phone =
          customer.equals("usr_aster_alex")
              ? "+8613812345678"
              : "+86139"
                  + String.format(
                      java.util.Locale.ROOT,
                      "%08d",
                      Integer.toUnsignedLong(customer.hashCode()) % 100000000);
      db.update(
          "insert into customer_phone_bindings(binding_id,customer_id,phone_e164,status,verified_at,created_at) values(?,?,?,'VERIFIED',current_timestamp,current_timestamp) on conflict(customer_id) do nothing",
          "phone_" + customer,
          customer,
          phone);
    }
  }
}
