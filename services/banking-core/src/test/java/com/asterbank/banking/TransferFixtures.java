package com.asterbank.banking;

import com.asterbank.banking.customer.account.adapter.inmemory.*;
import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.customer.payment.adapter.inmemory.*;
import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.customer.transaction.adapter.inmemory.*;
import com.asterbank.banking.customer.transaction.application.*;
import com.asterbank.banking.customer.transaction.domain.*;
import com.asterbank.banking.shared.adapter.inmemory.*;
import com.asterbank.banking.shared.domain.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.*;
import java.util.function.Consumer;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import tools.jackson.databind.json.JsonMapper;

final class TransferFixtures {
  static final CustomerId ALEX = ReadDomainFixtures.ALEX, OTHER = ReadDomainFixtures.OTHER;

  static List<Recipient> recipients() {
    return List.of(
        new Recipient(
            new RecipientId("recipient_zhang"),
            ALEX,
            "Zhang San",
            "Demo Harbour Bank",
            "•••• 6018",
            Currency.getInstance("CNY")),
        new Recipient(
            new RecipientId("recipient_li"),
            ALEX,
            "Li Si",
            "Demo Maple Bank",
            "•••• 2046",
            Currency.getInstance("CNY")),
        new Recipient(
            new RecipientId("recipient_mom"),
            ALEX,
            "Mom",
            "Demo Harbour Bank",
            "•••• 7732",
            Currency.getInstance("CNY")),
        new Recipient(
            new RecipientId("recipient_other"),
            OTHER,
            "Private recipient",
            "Private Bank",
            "•••• 9901",
            Currency.getInstance("CNY")));
  }

  static final class TestClock extends Clock {
    volatile Instant value = Instant.parse("2026-09-27T02:30:00Z");

    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    public Clock withZone(ZoneId zone) {
      return Clock.fixed(value, zone);
    }

    public Instant instant() {
      return value;
    }
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class HttpConfig {
    @Bean
    @Primary
    RecipientRepository testRecipients(BankingMemoryLock lock) {
      return new InMemoryRecipientRepository(recipients(), lock);
    }

    @Bean
    @Primary
    TestClock transferClock() {
      return new TestClock();
    }
  }

  static final class Harness {
    final BankingMemoryLock lock = new BankingMemoryLock();
    final TestClock clock = new TestClock();
    final UnitVerification verification = new UnitVerification(clock);
    final AtomicInteger sequence = new AtomicInteger();
    final InMemoryAccountRepository accounts;
    final InMemoryTransactionRepository transactions;
    final InMemoryTransferIntentRepository intents;
    final InMemoryTransferRepository transfers;
    final InMemoryIdempotencyRepository keys;
    volatile Consumer<String> afterWrite = stage -> {};
    List<Recipient> recipientData = recipients();
    final RecipientRepository recipients =
        new RecipientRepository() {
          public List<Recipient> list(CustomerId c) {
            return lock.read(
                () -> recipientData.stream().filter(r -> r.customerId().equals(c)).toList());
          }

          public Optional<Recipient> find(CustomerId c, RecipientId id) {
            return list(c).stream().filter(r -> r.id().equals(id)).findFirst();
          }
        };
    final TransferPreparationService preparation;
    final TransferExecutionService execution;
    final TransactionQueryService query;

    Harness() throws Exception {
      var seed = ReadDomainFixtures.withOther(JsonMapper.builder().build());
      accounts =
          new InMemoryAccountRepository(seed.accounts(), seed.asOf(), lock) {
            public void save(Account a, OffsetDateTime time) {
              super.save(a, time);
              afterWrite.accept("ACCOUNT");
            }
          };
      transactions =
          new InMemoryTransactionRepository(seed.transactions(), "initial", lock) {
            public void append(Transaction t) {
              super.append(t);
              afterWrite.accept("TRANSACTION");
            }
          };
      intents =
          new InMemoryTransferIntentRepository(lock) {
            public void save(TransferIntent i) {
              super.save(i);
              afterWrite.accept("INTENT");
            }
          };
      transfers =
          new InMemoryTransferRepository(lock) {
            public void save(Transfer t) {
              super.save(t);
              afterWrite.accept("TRANSFER");
            }
          };
      keys =
          new InMemoryIdempotencyRepository(lock) {
            public void save(Completed k) {
              super.save(k);
              afterWrite.accept("IDEMPOTENCY");
            }
          };
      var boundary =
          new InMemoryTransferExecutionBoundary(
              lock, accounts, transactions, intents, transfers, keys);
      var validation = new TransferValidation(accounts, recipients);
      IdGenerator ids = prefix -> prefix + "_" + sequence.incrementAndGet();
      preparation = new TransferPreparationService(validation, intents, boundary, ids, clock);
      execution =
          new TransferExecutionService(
                  validation,
                  intents,
                  transfers,
                  keys,
                  accounts,
                  transactions,
                  new TransferExecutionBoundary() {
                    public TransferIntent prepare(
                        java.util.function.Supplier<TransferIntent> work) {
                      return boundary.prepare(work);
                    }

                    public TransferIntent cancel(java.util.function.Supplier<TransferIntent> work) {
                      return boundary.cancel(work);
                    }

                    public Transfer execute(java.util.function.Supplier<Transfer> work) {
                      return verification.transaction(() -> boundary.execute(work));
                    }
                  },
                  ids,
                  clock)
              .withAuthorizations(verification.service);
      query = new TransactionQueryService(transactions, accounts::find, new CursorCodec());
    }

    PrepareTransfer command(String amount) {
      return new PrepareTransfer(
          new AccountId("acc_current"),
          new RecipientId("recipient_zhang"),
          Money.of(amount, "CNY"),
          "Test transfer");
    }

    TransferIntent prepare() {
      return prepare(ALEX, command("500.00"));
    }

    Transfer execute(TransferIntent intent, String key) {
      return execute(ALEX, intent.terms().id(), intent.intentHash(), key);
    }

    TransferIntent prepare(CustomerId owner, PrepareTransfer request) {
      return preparation.prepare(owner, request, owner.value());
    }

    Transfer execute(CustomerId owner, String id, String hash, String key) {
      var intent = intents.find(owner, id);
      String grant =
          intent.isPresent()
              ? verification.authorize(owner.value(), id, intent.get().intentHash())
              : null;
      return execution.execute(owner, id, hash, key, owner.value(), grant, null);
    }

    Account current() {
      return accounts.find(ALEX, new AccountId("acc_current")).orElseThrow();
    }

    void changeAccount(Account a) {
      accounts.save(a, OffsetDateTime.now(clock));
    }

    Account accountWith(String balance, AccountStatus status, String mask) {
      var a = current();
      return new Account(
          a.id(),
          a.customerId(),
          a.displayName(),
          a.type(),
          status,
          Money.of(balance, "CNY"),
          a.pendingAmount(),
          mask,
          a.openedAt(),
          null);
    }

    List<Object> financial() {
      return List.of(
          accounts.checkpoint(),
          transactions.checkpoint(),
          transfers.checkpoint(),
          keys.checkpoint());
    }

    List<Object> allState() {
      return List.of(financial(), intents.checkpoint());
    }
  }
}
