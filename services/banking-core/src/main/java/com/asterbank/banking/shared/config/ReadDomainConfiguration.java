package com.asterbank.banking.shared.config;

import com.asterbank.banking.customer.account.adapter.inmemory.InMemoryAccountRepository;
import com.asterbank.banking.customer.account.application.*;
import com.asterbank.banking.customer.transaction.adapter.inmemory.InMemoryTransactionRepository;
import com.asterbank.banking.customer.transaction.application.*;
import java.time.Clock;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
@Profile("unit")
public class ReadDomainConfiguration {
  @Bean
  DemoSeed demoSeed(Environment env, ObjectMapper mapper, Clock clock) throws java.io.IOException {
    return env.acceptsProfiles(Profiles.of("local", "test"))
        ? DemoSeed.load(mapper)
        : DemoSeed.empty(clock);
  }

  @Bean
  InMemoryAccountRepository accountRepository(
      DemoSeed seed, com.asterbank.banking.shared.adapter.inmemory.BankingMemoryLock lock) {
    return new InMemoryAccountRepository(seed.accounts(), seed.asOf(), lock);
  }

  @Bean
  InMemoryTransactionRepository transactionRepository(
      DemoSeed seed, com.asterbank.banking.shared.adapter.inmemory.BankingMemoryLock lock) {
    return new InMemoryTransactionRepository(seed.transactions(), "m13-initial-2026-09-27", lock);
  }

  @Bean
  TransactionAccountPort transactionAccountPort(AccountRepository accounts) {
    return accounts::find;
  }

  @Bean
  TransactionQueryService transactionQueryService(
      TransactionRepository transactions, TransactionAccountPort accounts) {
    return new TransactionQueryService(transactions, accounts, new CursorCodec());
  }

  @Bean
  AccountQueryService accountQueryService(
      AccountRepository accounts, TransactionQueryService transactions) {
    return new AccountQueryService(accounts, transactions);
  }
}
