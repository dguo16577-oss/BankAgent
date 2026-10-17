package com.asterbank.banking.shared.config;

import com.asterbank.banking.customer.account.adapter.inmemory.InMemoryAccountRepository;
import com.asterbank.banking.customer.payment.adapter.inmemory.*;
import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.customer.transaction.adapter.inmemory.InMemoryTransactionRepository;
import com.asterbank.banking.shared.adapter.inmemory.BankingMemoryLock;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.Clock;
import java.util.*;
import org.springframework.context.annotation.*;
import org.springframework.core.env.*;

@Configuration(proxyBeanMethods = false)
@Profile("unit")
public class PaymentDomainConfiguration {
  @Bean
  BankingMemoryLock bankingMemoryLock() {
    return new BankingMemoryLock();
  }

  @Bean
  RecipientRepository recipientRepository(Environment env, BankingMemoryLock lock) {
    var customer = new CustomerId("usr_aster_alex");
    var cny = Currency.getInstance("CNY");
    return new InMemoryRecipientRepository(
        env.acceptsProfiles(Profiles.of("local", "test"))
            ? List.of(
                new Recipient(
                    new RecipientId("recipient_zhang"),
                    customer,
                    "Zhang San",
                    "Demo Harbour Bank",
                    "•••• 6018",
                    cny),
                new Recipient(
                    new RecipientId("recipient_li"),
                    customer,
                    "Li Si",
                    "Demo Maple Bank",
                    "•••• 2046",
                    cny),
                new Recipient(
                    new RecipientId("recipient_mom"),
                    customer,
                    "Mom",
                    "Demo Harbour Bank",
                    "•••• 7732",
                    cny))
            : List.of(),
        lock);
  }

  @Bean
  InMemoryTransferIntentRepository transferIntentRepository(BankingMemoryLock lock) {
    return new InMemoryTransferIntentRepository(lock);
  }

  @Bean
  InMemoryTransferRepository transferRepository(BankingMemoryLock lock) {
    return new InMemoryTransferRepository(lock);
  }

  @Bean
  InMemoryIdempotencyRepository idempotencyRepository(BankingMemoryLock lock) {
    return new InMemoryIdempotencyRepository(lock);
  }

  @Bean
  TransferExecutionBoundary transferExecutionBoundary(
      BankingMemoryLock lock,
      InMemoryAccountRepository a,
      InMemoryTransactionRepository t,
      InMemoryTransferIntentRepository i,
      InMemoryTransferRepository r,
      InMemoryIdempotencyRepository k) {
    return new InMemoryTransferExecutionBoundary(lock, a, t, i, r, k);
  }

  @Bean
  IdGenerator idGenerator() {
    return prefix -> prefix + "_" + UUID.randomUUID();
  }

  @Bean
  TransferValidation transferValidation(
      InMemoryAccountRepository accounts, RecipientRepository recipients) {
    return new TransferValidation(accounts, recipients);
  }

  @Bean
  RecipientQueryService recipientQueryService(RecipientRepository recipients) {
    return new RecipientQueryService(recipients);
  }

  @Bean
  TransferPreparationService transferPreparationService(
      TransferValidation v,
      TransferIntentRepository i,
      TransferExecutionBoundary b,
      IdGenerator ids,
      Clock clock) {
    return new TransferPreparationService(v, i, b, ids, clock);
  }

  @Bean
  TransferExecutionService transferExecutionService(
      TransferValidation v,
      TransferIntentRepository i,
      TransferRepository r,
      IdempotencyRepository k,
      InMemoryAccountRepository a,
      InMemoryTransactionRepository t,
      TransferExecutionBoundary b,
      IdGenerator ids,
      Clock clock) {
    return new TransferExecutionService(v, i, r, k, a, t, b, ids, clock);
  }
}
