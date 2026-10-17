package com.asterbank.banking.customer.card.adapter.persistence;

import com.asterbank.banking.customer.card.application.*;
import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.security.application.ActionAuthorizationService;
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
public class CardConfiguration {
  @Bean
  CardPersistenceMapper cardPersistenceMapper(ObjectMapper mapper) {
    return new CardPersistenceMapper(mapper);
  }

  @Bean
  CardStore cardStore(
      DatabaseScope db,
      CardSpringDataRepository cards,
      CardPersistenceMapper mapper,
      PlatformTransactionManager tx) {
    return new PostgreSqlCardStore(db, cards, mapper, tx);
  }

  @Bean
  CardExecutionCheckpoint cardCheckpoint() {
    return stage -> {};
  }

  @Bean
  CardService cardService(
      CardStore store,
      IdempotencyRepository keys,
      ActionAuthorizationService auth,
      IdGenerator ids,
      Clock clock,
      CardExecutionCheckpoint checkpoint) {
    return new CardService(store, keys, auth, ids, clock, checkpoint);
  }

  @Bean
  CardAuthorizationStore cardAuthorizationStore(JdbcTemplate db) {
    return new JdbcCardAuthorizationStore(db);
  }

  @Bean
  CardAuthorizationService cardAuthorizationService(
      CardStore cards, CardAuthorizationStore decisions, IdGenerator ids, Clock clock) {
    return new CardAuthorizationService(cards, decisions, ids, clock);
  }

  @Bean
  CreditLimitStore creditLimitStore(JdbcTemplate db, PlatformTransactionManager tx) {
    return new JdbcCreditLimitStore(db, tx);
  }

  @Bean
  CreditLimitService creditLimitService(
      CreditLimitStore store,
      CardStore cards,
      ActionAuthorizationService grants,
      IdGenerator ids,
      Clock clock) {
    return new CreditLimitService(store, cards, grants, ids, clock);
  }

  @Bean
  DemoCardSeed demoCardSeed(JdbcTemplate db, PlatformTransactionManager tx) {
    return new DemoCardSeed(db, tx);
  }

  @Bean
  @Profile("(local | test | demo) & !unit & !prod")
  ApplicationRunner seedCards(
      DemoCardSeed cards, DemoDataInitializer banking, ObjectMapper mapper) {
    return args -> {
      banking.initialize(DemoSeed.load(mapper), DemoDataInitializer.alexRecipients());
      cards.initialize();
    };
  }
}
