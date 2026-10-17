package com.asterbank.banking.customer.wealth.adapter.persistence;

import com.asterbank.banking.customer.account.application.*;
import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.transaction.application.TransactionMutationPort;
import com.asterbank.banking.customer.wealth.application.*;
import com.asterbank.banking.shared.adapter.persistence.*;
import com.asterbank.banking.shared.config.DemoSeed;
import java.time.Clock;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
@Profile("!unit")
public class WealthConfiguration {
  @Bean
  WealthStore wealthStore(
      DatabaseScope db, JdbcTemplate sql, ObjectMapper mapper, PlatformTransactionManager tx) {
    return new PostgreSqlWealthStore(db, sql, new WealthPersistenceMapper(mapper), tx);
  }

  @Bean
  WealthExecutionCheckpoint wealthCheckpoint() {
    return stage -> {};
  }

  @Bean
  WealthService wealthService(
      WealthStore store,
      AccountRepository accounts,
      AccountMutationPort debits,
      TransactionMutationPort transactions,
      IdempotencyRepository keys,
      IdGenerator ids,
      Clock clock,
      WealthExecutionCheckpoint checkpoint,
      com.asterbank.banking.security.application.ActionAuthorizationService grants) {
    return new WealthService(store, accounts, debits, transactions, keys, ids, clock, checkpoint)
        .withAuthorizations(grants);
  }

  @Bean
  @Profile("(local | test | demo) & !unit & !prod")
  DemoWealthSeed demoWealthSeed(JdbcTemplate sql, PlatformTransactionManager tx) {
    return new DemoWealthSeed(sql, tx);
  }

  @Bean
  @Profile("(local | test | demo) & !unit & !prod")
  ApplicationRunner seedWealth(
      DemoDataInitializer banking, DemoWealthSeed wealth, ObjectMapper mapper) {
    return args -> {
      banking.initialize(DemoSeed.load(mapper), DemoDataInitializer.alexRecipients());
      wealth.initialize();
    };
  }
}
