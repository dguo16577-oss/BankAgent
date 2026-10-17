package com.asterbank.banking.shared.config;

import com.asterbank.banking.customer.account.adapter.persistence.*;
import com.asterbank.banking.customer.account.application.*;
import com.asterbank.banking.customer.payment.adapter.persistence.*;
import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.transaction.adapter.persistence.*;
import com.asterbank.banking.customer.transaction.application.*;
import com.asterbank.banking.shared.adapter.persistence.*;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.util.UUID;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
@Profile("!unit")
public class PostgreSqlConfiguration {
  @Bean
  DatabaseScope databaseScope(PlatformTransactionManager tx, EntityManager em) {
    return new DatabaseScope(tx, em);
  }

  @Bean
  PostgreSqlAccountRepositoryAdapter accountRepository(
      DatabaseScope db, AccountSpringDataRepository data) {
    return new PostgreSqlAccountRepositoryAdapter(db, data);
  }

  @Bean
  PostgreSqlTransactionRepositoryAdapter transactionRepository(DatabaseScope db) {
    return new PostgreSqlTransactionRepositoryAdapter(db);
  }

  @Bean
  PostgreSqlRecipientRepositoryAdapter recipientRepository(DatabaseScope db) {
    return new PostgreSqlRecipientRepositoryAdapter(db);
  }

  @Bean
  SnapshotCodec snapshotCodec(ObjectMapper mapper) {
    return new SnapshotCodec(mapper);
  }

  @Bean
  TransferIntentRepository intentRepository(DatabaseScope db, SnapshotCodec codec) {
    return new PostgreSqlTransferIntentRepositoryAdapter(db, codec);
  }

  @Bean
  TransferRepository transferRepository(DatabaseScope db, SnapshotCodec codec) {
    return new PostgreSqlTransferRepositoryAdapter(db, codec);
  }

  @Bean
  IdempotencyRepository idempotencyRepository(DatabaseScope db, Clock clock) {
    return new PostgreSqlIdempotencyRepositoryAdapter(db, clock);
  }

  @Bean
  TransferExecutionBoundary executionBoundary(PlatformTransactionManager tx) {
    return new PostgreSqlTransferExecutionBoundary(tx);
  }

  @Bean
  IdGenerator idGenerator() {
    return prefix -> prefix + "_" + UUID.randomUUID();
  }

  @Bean
  TransactionAccountPort transactionAccountPort(AccountRepository accounts) {
    return accounts::find;
  }

  @Bean
  TransactionQueryService transactionQueryService(
      TransactionRepository repo, TransactionAccountPort accounts) {
    return new TransactionQueryService(repo, accounts, new CursorCodec());
  }

  @Bean
  AccountQueryService accountQueryService(
      AccountRepository accounts, TransactionQueryService transactions) {
    return new AccountQueryService(accounts, transactions);
  }

  @Bean
  RecipientQueryService recipientQueryService(RecipientRepository recipients) {
    return new RecipientQueryService(recipients);
  }

  @Bean
  RecipientMutationPort recipientMutations(
      DatabaseScope db, ObjectMapper mapper, PlatformTransactionManager tx) {
    return new PostgreSqlRecipientMutationAdapter(db, mapper, tx);
  }

  @Bean
  RecipientManagementService recipientManagement(
      RecipientRepository reads,
      RecipientMutationPort writes,
      IdempotencyRepository keys,
      IdGenerator ids,
      Clock clock,
      org.springframework.core.env.Environment env,
      com.asterbank.banking.security.application.ActionAuthorizationService grants) {
    return new RecipientManagementService(
            reads,
            writes,
            keys,
            ids,
            clock,
            env.matchesProfiles("local", "demo", "test") && !env.matchesProfiles("prod"))
        .withAuthorizations(grants);
  }

  @Bean
  TransferValidation transferValidation(
      AccountRepository accounts, RecipientRepository recipients) {
    return new TransferValidation(accounts, recipients);
  }

  @Bean
  TransferPreparationService preparation(
      TransferValidation v,
      TransferIntentRepository i,
      TransferExecutionBoundary b,
      IdGenerator ids,
      Clock clock) {
    return new TransferPreparationService(v, i, b, ids, clock);
  }

  @Bean
  SplitStore splitStore(DatabaseScope db, PlatformTransactionManager tx, ObjectMapper mapper) {
    return new PostgreSqlSplitStore(db, tx, mapper);
  }

  @Bean
  SplitRequestService splitRequestService(
      SplitStore store,
      AccountRepository accounts,
      RecipientRepository recipients,
      IdempotencyRepository keys,
      com.asterbank.banking.security.application.ActionAuthorizationService grants,
      IdGenerator ids,
      Clock clock) {
    return new SplitRequestService(store, accounts, recipients, keys, grants, ids, clock);
  }

  @Bean
  TransferExecutionService execution(
      TransferValidation v,
      TransferIntentRepository i,
      TransferRepository t,
      IdempotencyRepository k,
      PostgreSqlAccountRepositoryAdapter a,
      PostgreSqlTransactionRepositoryAdapter x,
      TransferExecutionBoundary b,
      IdGenerator ids,
      Clock clock,
      com.asterbank.banking.security.application.ActionAuthorizationService grants,
      DatabaseScope db,
      JdbcTemplate jdbc,
      Environment env) {
    var service =
        new TransferExecutionService(v, i, t, k, a, x, b, ids, clock).withAuthorizations(grants);
    if (env.matchesProfiles("local", "demo", "test") && !env.matchesProfiles("prod"))
      service.withInternalPosting(new PostgreSqlInternalTransferPosting(db, jdbc, a, a, x, ids));
    return service;
  }

  @Bean
  ScheduleStore scheduleStore(DatabaseScope db, ObjectMapper json, PlatformTransactionManager tx) {
    return new PostgreSqlScheduleStore(db, json, tx);
  }

  @Bean
  ScheduledPaymentService scheduledPayments(
      ScheduleStore store,
      TransferValidation validation,
      TransferExecutionService execution,
      TransferIntentRepository intents,
      IdempotencyRepository keys,
      com.asterbank.banking.security.application.ActionAuthorizationService grants,
      IdGenerator ids,
      Clock clock) {
    return new ScheduledPaymentService(
        store, validation, execution, intents, keys, grants, ids, clock);
  }

  @Bean
  DemoDataInitializer demoDataInitializer(DatabaseScope db, PlatformTransactionManager tx) {
    return new DemoDataInitializer(db, tx);
  }

  @Bean
  @Profile("(local | demo) & !unit & !prod")
  ApplicationRunner seedLocal(DemoDataInitializer seed, ObjectMapper mapper) {
    return args -> seed.initializeDemo(DemoSeed.load(mapper));
  }
}
