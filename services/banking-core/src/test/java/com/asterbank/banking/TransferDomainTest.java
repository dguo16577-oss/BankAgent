package com.asterbank.banking;

import static com.asterbank.banking.TransferFixtures.*;
import static com.asterbank.banking.customer.payment.application.PaymentFailure.Code.*;
import static org.assertj.core.api.Assertions.*;

import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.customer.transaction.application.*;
import com.asterbank.banking.customer.transaction.domain.*;
import com.asterbank.banking.shared.domain.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class TransferDomainTest {
  Harness h;

  @BeforeEach
  void setup() throws Exception {
    h = new Harness();
  }

  static void fails(
      PaymentFailure.Code code, org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
    assertThatThrownBy(action)
        .isInstanceOfSatisfying(PaymentFailure.class, e -> assertThat(e.code()).isEqualTo(code));
  }

  @Test
  void prepareDoesNotChangeAnyFinancialState() {
    var before = h.financial();
    var intent = h.prepare();
    assertThat(h.financial()).isEqualTo(before);
    assertThat(h.intents.checkpoint()).hasSize(1);
    assertThat(intent.terms().fee().decimal()).isEqualTo("0.00");
    assertThat(intent.terms().totalDebit()).isEqualTo(intent.terms().amount());
    assertThat(intent.terms().projectedAvailableBalance().decimal()).isEqualTo("23310.31");
    assertThat(intent.terms().expiresAt()).isEqualTo(intent.terms().createdAt().plusMinutes(15));
  }

  @Test
  void standardScenarioMutatesExistingDomainsExactlyOnceAndReplayPrecedesExpiry() {
    var intent = h.prepare();
    var result = h.execute(intent, "same");
    assertThat(h.current().balance().decimal()).isEqualTo("23342.31");
    assertThat(h.current().pendingAmount().decimal()).isEqualTo("32.00");
    assertThat(h.current().availableBalance().decimal()).isEqualTo("23310.31");
    assertThat(h.intents.find(ALEX, intent.terms().id()).orElseThrow().status())
        .isEqualTo(TransferIntent.Status.EXECUTED);
    assertThat(h.transfers.checkpoint()).hasSize(1);
    assertThat(h.transactions.checkpoint().transactions()).hasSize(63);
    assertThat(h.keys.checkpoint()).hasSize(1);
    var tx = h.query.detail(ALEX, result.transactionId()).transaction();
    assertThat(tx.type()).isEqualTo(TransactionType.BANK_TRANSFER);
    assertThat(tx.category()).isEqualTo(TransactionCategory.TRANSFER);
    assertThat(tx.direction()).isEqualTo(TransactionDirection.DEBIT);
    assertThat(tx.status()).isEqualTo(TransactionStatus.COMPLETED);
    assertThat(tx.amount()).isEqualTo(result.terms().amount());
    assertThat(tx.reference()).isEqualTo(result.reference());
    assertThat(tx.merchant()).isNull();
    assertThat(tx.counterparty().maskedAccountNumber()).isEqualTo("•••• 6018");
    assertThat(tx.bookedAt()).isEqualTo(tx.occurredAt());
    var before = h.allState();
    h.clock.value = h.clock.value.plusSeconds(3600);
    assertThat(h.execute(intent, "same")).isEqualTo(result);
    assertThat(h.allState()).isEqualTo(before);
    fails(TRANSFER_INTENT_ALREADY_EXECUTED, () -> h.execute(intent, "different"));
    assertThat(h.allState()).isEqualTo(before);
  }

  @Test
  void sameKeyDifferentRequestConflictsAndOtherCustomerCanUseSameKey() {
    var first = h.prepare();
    h.execute(first, "key");
    var next = h.prepare();
    var before = h.allState();
    fails(IDEMPOTENCY_KEY_REUSED, () -> h.execute(next, "key"));
    assertThat(h.allState()).isEqualTo(before);
    var other =
        h.prepare(
            OTHER,
            new PrepareTransfer(
                new AccountId("acc_other"),
                new RecipientId("recipient_other"),
                Money.of("100", "CNY"),
                ""));
    var result = h.execute(OTHER, other.terms().id(), other.intentHash(), "key");
    assertThat(result.customerId()).isEqualTo(OTHER);
    assertThat(h.keys.checkpoint()).hasSize(2);
  }

  @Test
  void hashMismatchLeavesAllStateUnchanged() {
    var i = h.prepare();
    var before = h.allState();
    fails(TRANSFER_INTENT_HASH_MISMATCH, () -> h.execute(ALEX, i.terms().id(), "tampered", "key"));
    assertThat(h.allState()).isEqualTo(before);
  }

  @ParameterizedTest
  @ValueSource(longs = {0, 1})
  void atAndAfterExpiryFailWithoutPersistingExpiredState(long seconds) {
    var i = h.prepare();
    var before = h.allState();
    h.clock.value = i.terms().expiresAt().toInstant().plusSeconds(seconds);
    assertThat(h.preparation.get(ALEX, i.terms().id()).status())
        .isEqualTo(TransferIntent.Status.EXPIRED);
    fails(TRANSFER_INTENT_EXPIRED, () -> h.execute(i, "key"));
    assertThat(h.allState()).isEqualTo(before);
  }

  @Test
  void justBeforeExpiryStillValid() {
    var i = h.prepare();
    h.clock.value = i.terms().expiresAt().toInstant().minusNanos(1);
    assertThat(h.execute(i, "key")).isNotNull();
  }

  @Test
  void immutableReviewIsNotRebuiltAfterAccountChangesAndBalanceChangeAloneDoesNotStale() {
    var i = h.prepare();
    h.changeAccount(h.current().debit(Money.of("100", "CNY")));
    assertThat(h.preparation.get(ALEX, i.terms().id())).isEqualTo(i);
    var receipt = h.execute(i, "key");
    assertThat(receipt.sourceAccount().balance().decimal()).isEqualTo("23742.31");
    assertThat(h.current().balance().decimal()).isEqualTo("23242.31");
    assertThat(h.preparation.get(ALEX, i.terms().id()).terms()).isEqualTo(i.terms());
  }

  @Test
  void insufficientAfterPrepareRevalidatesAndPreservesState() {
    var i = h.prepare();
    h.changeAccount(h.accountWith("400.00", AccountStatus.ACTIVE, "•••• 1048"));
    var before = h.allState();
    fails(INSUFFICIENT_FUNDS, () -> h.execute(i, "key"));
    assertThat(h.allState()).isEqualTo(before);
  }

  @Test
  void accountStatusAndMaskedIdentifierAreRevalidated() {
    var i = h.prepare();
    h.changeAccount(h.accountWith("23842.31", AccountStatus.FROZEN, "•••• 1048"));
    var before = h.allState();
    fails(ACCOUNT_NOT_ELIGIBLE, () -> h.execute(i, "key"));
    assertThat(h.allState()).isEqualTo(before);
    h.changeAccount(h.accountWith("23842.31", AccountStatus.ACTIVE, "•••• 1111"));
    before = h.allState();
    fails(TRANSFER_INTENT_HASH_MISMATCH, () -> h.execute(i, "key"));
    assertThat(h.allState()).isEqualTo(before);
  }

  @Test
  void recipientSnapshotChangeRequiresNewReview() {
    var i = h.prepare();
    var r = i.terms().recipient();
    h.lock.write(
        () ->
            h.recipientData =
                List.of(
                    new Recipient(
                        r.id(),
                        ALEX,
                        "Changed name",
                        r.bankName(),
                        r.maskedAccountNumber(),
                        r.currency())));
    assertThat(h.preparation.get(ALEX, i.terms().id()).terms().recipient()).isEqualTo(r);
    var before = h.allState();
    fails(TRANSFER_INTENT_HASH_MISMATCH, () -> h.execute(i, "key"));
    assertThat(h.allState()).isEqualTo(before);
  }

  @Test
  void sourceAndRecipientRemovalAreRevalidated() {
    var i = h.prepare();
    var a = h.accounts.checkpoint();
    h.accounts.restore(
        new com.asterbank.banking.customer.account.adapter.inmemory.InMemoryAccountRepository.State(
            a.accounts().stream().filter(x -> !x.id().value().equals("acc_current")).toList(),
            a.asOf()));
    fails(ACCOUNT_NOT_FOUND, () -> h.execute(i, "key"));
    h.accounts.restore(a);
    h.lock.write(() -> h.recipientData = List.of());
    fails(RECIPIENT_NOT_FOUND, () -> h.execute(i, "key"));
    assertThat(h.transfers.checkpoint()).isEmpty();
    assertThat(h.keys.checkpoint()).isEmpty();
  }

  @Test
  void prepareValidationAndCustomerIsolation() {
    fails(
        ACCOUNT_NOT_FOUND,
        () ->
            h.prepare(
                ALEX,
                new PrepareTransfer(
                    new AccountId("acc_other"),
                    new RecipientId("recipient_zhang"),
                    Money.of("10", "CNY"),
                    "")));
    fails(
        ACCOUNT_NOT_FOUND,
        () ->
            h.prepare(
                ALEX,
                new PrepareTransfer(
                    new AccountId("missing"),
                    new RecipientId("recipient_zhang"),
                    Money.of("10", "CNY"),
                    "")));
    fails(
        RECIPIENT_NOT_FOUND,
        () ->
            h.prepare(
                ALEX,
                new PrepareTransfer(
                    new AccountId("acc_current"),
                    new RecipientId("recipient_other"),
                    Money.of("10", "CNY"),
                    "")));
    fails(
        RECIPIENT_NOT_FOUND,
        () ->
            h.prepare(
                ALEX,
                new PrepareTransfer(
                    new AccountId("acc_current"),
                    new RecipientId("missing"),
                    Money.of("10", "CNY"),
                    "")));
    fails(INVALID_AMOUNT, () -> h.prepare(ALEX, h.command("0")));
    fails(INVALID_AMOUNT, () -> h.prepare(ALEX, h.command("-1")));
    fails(INVALID_AMOUNT, () -> h.prepare(ALEX, h.command("1000000000000")));
    fails(
        CURRENCY_MISMATCH,
        () ->
            h.prepare(
                ALEX,
                new PrepareTransfer(
                    new AccountId("acc_usd"),
                    new RecipientId("recipient_zhang"),
                    Money.of("10", "USD"),
                    "")));
    fails(INSUFFICIENT_FUNDS, () -> h.prepare(ALEX, h.command("23811")));
    assertThat(h.intents.checkpoint()).isEmpty();
  }

  @Test
  void resourceOwnershipAndUnknownHaveSameFailure() {
    var i = h.prepare();
    fails(TRANSFER_INTENT_NOT_FOUND, () -> h.preparation.get(OTHER, i.terms().id()));
    fails(TRANSFER_INTENT_NOT_FOUND, () -> h.execute(OTHER, i.terms().id(), i.intentHash(), "key"));
    var receipt = h.execute(i, "key");
    fails(TRANSFER_NOT_FOUND, () -> h.execution.get(OTHER, receipt.id()));
    fails(TRANSFER_NOT_FOUND, () -> h.execution.get(OTHER, "missing"));
    var other =
        h.prepare(
            OTHER,
            new PrepareTransfer(
                new AccountId("acc_other"),
                new RecipientId("recipient_other"),
                Money.of("10", "CNY"),
                ""));
    fails(TRANSFER_INTENT_NOT_FOUND, () -> h.preparation.get(ALEX, other.terms().id()));
  }

  @Test
  void accountDomainGuardsDebitInvariants() {
    var a = h.current();
    assertThatThrownBy(() -> a.debit(Money.of("0", "CNY")))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> a.debit(Money.of("-1", "CNY")))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> a.debit(Money.of("1", "USD")))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> a.debit(Money.of("23811", "CNY")))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(
            () ->
                h.accountWith("100", AccountStatus.FROZEN, "•••• 1048").debit(Money.of("1", "CNY")))
        .isInstanceOf(IllegalStateException.class);
    assertThat(a.availableBalance()).isEqualTo(a.balance().subtract(a.pendingAmount()));
  }

  @Test
  void preparationRejectsInactiveSourceAndRecipientCurrencyMismatch() {
    h.changeAccount(h.accountWith("23842.31", AccountStatus.RESTRICTED, "•••• 1048"));
    fails(ACCOUNT_NOT_ELIGIBLE, () -> h.prepare());
    h.changeAccount(h.accountWith("23842.31", AccountStatus.ACTIVE, "•••• 1048"));
    var r = h.recipientData.getFirst();
    h.lock.write(
        () ->
            h.recipientData =
                List.of(
                    new Recipient(
                        r.id(),
                        ALEX,
                        r.displayName(),
                        r.bankName(),
                        r.maskedAccountNumber(),
                        Currency.getInstance("USD"))));
    fails(CURRENCY_MISMATCH, () -> h.prepare());
    assertThat(h.intents.checkpoint()).isEmpty();
  }

  @Test
  void hashBindsSourceIdentityAndLifecycleDoesNotChangeHash() {
    var intent = h.prepare();
    var t = intent.terms();
    var hasher = new IntentHasher();
    var savings = h.accounts.find(ALEX, new AccountId("acc_savings")).orElseThrow();
    var changed =
        new IntentTerms(
            t.id(),
            t.customerId(),
            savings,
            t.recipient(),
            t.amount(),
            t.fee(),
            t.totalDebit(),
            t.projectedAvailableBalance(),
            t.note(),
            t.createdAt(),
            t.expiresAt());
    assertThat(hasher.hash(changed)).isNotEqualTo(intent.intentHash());
    h.execute(intent, "key");
    var executed = h.preparation.get(ALEX, t.id());
    assertThat(executed.intentHash()).isEqualTo(intent.intentHash());
    assertThat(hasher.hash(executed.terms())).isEqualTo(intent.intentHash());
    assertThatThrownBy(() -> h.intents.save(intent)).isInstanceOf(IllegalStateException.class);
  }

  @ParameterizedTest
  @ValueSource(strings = {"ACCOUNT", "TRANSACTION", "TRANSFER", "INTENT", "IDEMPOTENCY"})
  void failureAfterEveryWriteRollsBackAllStateAndSameKeyCanRetry(String stage) {
    var i = h.prepare();
    var before = h.allState();
    h.afterWrite =
        s -> {
          if (s.equals(stage)) throw new IllegalStateException("Test injected failure");
        };
    fails(PERSISTENCE_UNAVAILABLE, () -> h.execute(i, "key"));
    assertThat(h.allState()).isEqualTo(before);
    h.afterWrite = s -> {};
    h.execute(i, "key");
    assertThat(h.transfers.checkpoint()).hasSize(1);
  }

  @Test
  void preparePersistenceFailureDoesNotLeakIntent() {
    var before = h.allState();
    h.afterWrite =
        s -> {
          throw new IllegalStateException("Injected");
        };
    fails(PERSISTENCE_UNAVAILABLE, () -> h.prepare());
    assertThat(h.allState()).isEqualTo(before);
  }

  @Test
  void mutationInvalidatesOldCursorButReplayDoesNotAdvanceRevision() {
    var filter = new TransactionFilter(null, null, null, null, null, null, null, null, "", 10);
    var old = h.query.list(ALEX, filter, null);
    var i = h.prepare();
    h.execute(i, "key");
    assertThatThrownBy(() -> h.query.list(ALEX, filter, old.nextCursor()))
        .isInstanceOf(InvalidCursor.class);
    var revision = h.transactions.snapshotRevision();
    h.execute(i, "key");
    assertThat(h.transactions.snapshotRevision()).isEqualTo(revision);
  }

  @Test
  void canonicalHashBindsEveryReviewedTermAndIgnoresMoneyLexicalScale() {
    var t = h.prepare().terms();
    var hasher = new IntentHasher();
    var hash = hasher.hash(t);
    for (String amount : List.of("500", "500.0", "500.00")) {
      assertThat(IntentHasher.canonicalAmount(new BigDecimal(amount))).isEqualTo("500");
      var changed =
          new IntentTerms(
              t.id(),
              t.customerId(),
              t.sourceAccount(),
              t.recipient(),
              Money.of(amount, "CNY"),
              t.fee(),
              t.totalDebit(),
              t.projectedAvailableBalance(),
              t.note(),
              t.createdAt(),
              t.expiresAt(),
              t.sessionId(),
              t.authorizationRequirement(),
              t.policyVersion());
      assertThat(hasher.hash(changed)).isEqualTo(hash);
    }
    assertThat(IntentHasher.canonicalAmount(new BigDecimal("0.00"))).isEqualTo("0");
    var r = t.recipient();
    var variants =
        List.of(
            new IntentTerms(
                t.id(),
                t.customerId(),
                t.sourceAccount(),
                r,
                Money.of("501", "CNY"),
                t.fee(),
                t.totalDebit(),
                t.projectedAvailableBalance(),
                t.note(),
                t.createdAt(),
                t.expiresAt(),
                t.sessionId(),
                t.authorizationRequirement(),
                t.policyVersion()),
            new IntentTerms(
                t.id(),
                t.customerId(),
                t.sourceAccount(),
                new Recipient(
                    new RecipientId("other"),
                    ALEX,
                    r.displayName(),
                    r.bankName(),
                    r.maskedAccountNumber(),
                    r.currency()),
                t.amount(),
                t.fee(),
                t.totalDebit(),
                t.projectedAvailableBalance(),
                t.note(),
                t.createdAt(),
                t.expiresAt(),
                t.sessionId(),
                t.authorizationRequirement(),
                t.policyVersion()),
            new IntentTerms(
                t.id(),
                t.customerId(),
                h.accountWith("23842.31", AccountStatus.ACTIVE, "•••• 1111"),
                r,
                t.amount(),
                t.fee(),
                t.totalDebit(),
                t.projectedAvailableBalance(),
                t.note(),
                t.createdAt(),
                t.expiresAt(),
                t.sessionId(),
                t.authorizationRequirement(),
                t.policyVersion()),
            new IntentTerms(
                t.id(),
                t.customerId(),
                t.sourceAccount(),
                r,
                t.amount(),
                Money.of("1", "CNY"),
                t.totalDebit(),
                t.projectedAvailableBalance(),
                t.note(),
                t.createdAt(),
                t.expiresAt(),
                t.sessionId(),
                t.authorizationRequirement(),
                t.policyVersion()),
            new IntentTerms(
                t.id(),
                t.customerId(),
                t.sourceAccount(),
                r,
                t.amount(),
                t.fee(),
                t.totalDebit(),
                t.projectedAvailableBalance(),
                "other note",
                t.createdAt(),
                t.expiresAt(),
                t.sessionId(),
                t.authorizationRequirement(),
                t.policyVersion()),
            new IntentTerms(
                t.id(),
                t.customerId(),
                t.sourceAccount(),
                r,
                t.amount(),
                t.fee(),
                t.totalDebit(),
                t.projectedAvailableBalance(),
                t.note(),
                t.createdAt(),
                t.expiresAt().plusSeconds(1)));
    for (var v : variants) assertThat(hasher.hash(v)).isNotEqualTo(hash);
    assertThat(hasher.hash(t)).isEqualTo(hash).matches("[a-f0-9]{64}");
  }

  @Test
  void savedIntentRejectsTermReplacement() {
    var i = h.prepare();
    var t = i.terms();
    var changed =
        new IntentTerms(
            t.id(),
            t.customerId(),
            t.sourceAccount(),
            t.recipient(),
            Money.of("1", "CNY"),
            t.fee(),
            t.totalDebit(),
            t.projectedAvailableBalance(),
            t.note(),
            t.createdAt(),
            t.expiresAt());
    assertThatThrownBy(
            () -> h.intents.save(new TransferIntent(changed, i.intentHash(), i.status())))
        .isInstanceOf(IllegalStateException.class);
    assertThat(h.preparation.get(ALEX, t.id())).isEqualTo(i);
  }

  List<Object> race(Callable<Transfer> first, Callable<Transfer> second) throws Exception {
    var start = new CountDownLatch(1);
    var ready = new CountDownLatch(2);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var jobs = new ArrayList<Future<Object>>();
      for (var action : List.of(first, second))
        jobs.add(
            pool.submit(
                () -> {
                  ready.countDown();
                  if (!start.await(5, TimeUnit.SECONDS)) throw new AssertionError("start timeout");
                  try {
                    return action.call();
                  } catch (PaymentFailure failure) {
                    return failure.code();
                  }
                }));
      assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
      start.countDown();
      return List.of(jobs.get(0).get(5, TimeUnit.SECONDS), jobs.get(1).get(5, TimeUnit.SECONDS));
    }
  }

  @Test
  void concurrentSameIntentSameKeyReturnsIdenticalReceipt() throws Exception {
    var i = h.prepare();
    var results = race(() -> h.execute(i, "key"), () -> h.execute(i, "key"));
    assertThat(results.get(0)).isInstanceOf(Transfer.class).isEqualTo(results.get(1));
    assertSingleDebit("23342.31");
  }

  @Test
  void concurrentSameIntentDifferentKeysCannotDoubleExecute() throws Exception {
    var i = h.prepare();
    var results = race(() -> h.execute(i, "one"), () -> h.execute(i, "two"));
    assertThat(results.stream().filter(Transfer.class::isInstance).count()).isEqualTo(1);
    assertThat(results).contains(TRANSFER_INTENT_ALREADY_EXECUTED);
    assertSingleDebit("23342.31");
  }

  @Test
  void concurrentTwo500IntentsAgainst600AvailableCannotOverdraw() throws Exception {
    h.changeAccount(h.accountWith("632.00", AccountStatus.ACTIVE, "•••• 1048"));
    var one = h.prepare();
    var two = h.prepare();
    var results = race(() -> h.execute(one, "one"), () -> h.execute(two, "two"));
    assertThat(results.stream().filter(Transfer.class::isInstance).count()).isEqualTo(1);
    assertThat(results).contains(INSUFFICIENT_FUNDS);
    assertSingleDebit("132.00");
    assertThat(h.current().availableBalance().decimal()).isEqualTo("100.00");
  }

  @Test
  void readerCannotObservePartialMutationOrRolledBackDebit() throws Exception {
    var i = h.prepare();
    var entered = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    h.afterWrite =
        s -> {
          if (s.equals("ACCOUNT")) {
            entered.countDown();
            try {
              if (!release.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("timeout");
            } catch (InterruptedException e) {
              Thread.currentThread().interrupt();
              throw new IllegalStateException(e);
            }
            throw new IllegalStateException("Injected");
          }
        };
    try (var pool = Executors.newFixedThreadPool(2)) {
      var writer =
          pool.submit(
              () -> {
                fails(PERSISTENCE_UNAVAILABLE, () -> h.execute(i, "key"));
              });
      assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
      var started = new CountDownLatch(1);
      var reader =
          pool.submit(
              () -> {
                started.countDown();
                return h.current();
              });
      assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
      try {
        assertThatThrownBy(() -> reader.get(100, TimeUnit.MILLISECONDS))
            .isInstanceOf(TimeoutException.class);
      } finally {
        release.countDown();
      }
      writer.get(5, TimeUnit.SECONDS);
      assertThat(reader.get(5, TimeUnit.SECONDS).balance().decimal()).isEqualTo("23842.31");
    }
  }

  void assertSingleDebit(String balance) {
    assertThat(h.current().balance().decimal()).isEqualTo(balance);
    assertThat(h.current().pendingAmount().decimal()).isEqualTo("32.00");
    assertThat(h.transfers.checkpoint()).hasSize(1);
    assertThat(h.transactions.checkpoint().transactions()).hasSize(63);
    assertThat(h.keys.checkpoint()).hasSize(1);
  }
}
