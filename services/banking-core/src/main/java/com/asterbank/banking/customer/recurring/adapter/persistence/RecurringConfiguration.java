package com.asterbank.banking.customer.recurring.adapter.persistence;

import com.asterbank.banking.customer.card.adapter.persistence.DemoCardSeed;
import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.recurring.application.*;
import com.asterbank.banking.customer.transaction.application.TransactionRepository;
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
public class RecurringConfiguration {
  @Bean
  PostgreSqlRecurringStore recurringStore(
      DatabaseScope db, JdbcTemplate sql, ObjectMapper mapper, PlatformTransactionManager tx) {
    return new PostgreSqlRecurringStore(db, sql, new RecurringPersistenceMapper(mapper), tx);
  }

  @Bean
  RecurringExecutionCheckpoint recurringCheckpoint() {
    return stage -> {};
  }

  @Bean
  RecurringService recurringService(
      RecurringStore store,
      TransactionRepository transactions,
      IdempotencyRepository keys,
      IdGenerator ids,
      Clock clock,
      RecurringExecutionCheckpoint checkpoint,
      com.asterbank.banking.security.application.ActionAuthorizationService grants) {
    return new RecurringService(store, transactions, keys, ids, clock, checkpoint)
        .withAuthorizations(grants);
  }

  @Bean
  DemoRecurringSeed demoRecurringSeed(JdbcTemplate sql, PlatformTransactionManager tx) {
    return new DemoRecurringSeed(sql, tx);
  }

  @Bean
  @Profile("(local | test | demo) & !unit & !prod")
  ApplicationRunner seedRecurring(
      DemoDataInitializer banking,
      DemoCardSeed cards,
      DemoRecurringSeed recurring,
      ObjectMapper mapper) {
    return args -> {
      banking.initialize(DemoSeed.load(mapper), DemoDataInitializer.alexRecipients());
      cards.initialize();
      recurring.initialize();
    };
  }
}
