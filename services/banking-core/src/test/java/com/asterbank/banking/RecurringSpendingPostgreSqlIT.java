package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;

import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.customer.card.adapter.persistence.DemoCardSeed;
import com.asterbank.banking.customer.card.application.CardService;
import com.asterbank.banking.customer.card.domain.CardActionType;
import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.customer.recurring.adapter.persistence.*;
import com.asterbank.banking.customer.recurring.application.*;
import com.asterbank.banking.customer.recurring.domain.*;
import com.asterbank.banking.customer.spending.application.*;
import com.asterbank.banking.customer.spending.domain.*;
import com.asterbank.banking.security.application.SecurityService;
import com.asterbank.banking.security.domain.SecurityState.Binding;
import com.asterbank.banking.shared.adapter.persistence.*;
import com.asterbank.banking.shared.domain.*;
import java.math.BigDecimal;
import java.net.*;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.jdbc.autoconfigure.JdbcConnectionDetails;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class RecurringSpendingPostgreSqlIT {
  static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
  static final CustomerId ALEX = new CustomerId("usr_aster_alex"),
      OTHER = new CustomerId("customer_other");
  static final JsonMapper JSON = JsonMapper.builder().build();
  static ConfigurableApplicationContext context;
  static JdbcTemplate db;
  static RecurringService recurring;
  static RecurringStore store;
  static SpendingQueryService spending;
  static TransferFixtures.TestClock clock;
  static Fault fault;
  static String base, credentialHash;

  static final class Fault implements RecurringExecutionCheckpoint {
    volatile Stage failAt;

    public void reached(Stage stage) {
      if (stage == failAt) throw new IllegalStateException("Test injected failure");
    }
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class Config {
    @Bean
    JdbcConnectionDetails connectionDetails() {
      return new JdbcConnectionDetails() {
        public String getJdbcUrl() {
          return POSTGRES.getJdbcUrl();
        }

        public String getUsername() {
          return POSTGRES.getUsername();
        }

        public String getPassword() {
          return POSTGRES.getPassword();
        }

        public String getDriverClassName() {
          return "org.postgresql.Driver";
        }
      };
    }

    @Bean
    @Primary
    TransferFixtures.TestClock testClock() {
      return new TransferFixtures.TestClock();
    }

    @Bean
    @Primary
    Fault recurringTestFault() {
      return new Fault();
    }
  }

  static void open() {
    context =
        new SpringApplicationBuilder(BankingCoreApplication.class)
            .sources(Config.class)
            .profiles("local", "test")
            .run("--server.port=0");
    db = context.getBean(JdbcTemplate.class);
    recurring = context.getBean(RecurringService.class);
    store = context.getBean(RecurringStore.class);
    spending = context.getBean(SpendingQueryService.class);
    clock = context.getBean(TransferFixtures.TestClock.class);
    fault = context.getBean(Fault.class);
    base = "http://localhost:" + context.getEnvironment().getProperty("local.server.port");
  }

  @BeforeAll
  static void start() {
    POSTGRES.start();
    open();
    credentialHash = context.getBean(PasswordEncoder.class).encode("demo-password");
  }

  @AfterAll
  static void stop() {
    if (context != null) context.close();
    POSTGRES.stop();
  }

  @BeforeEach
  void reset() throws Exception {
    db.execute("truncate spring_session cascade");
    db.execute("truncate customers cascade");
    clock.value = Instant.parse("2026-09-27T02:30:00Z");
    fault.failAt = null;
    context
        .getBean(DemoDataInitializer.class)
        .initialize(ReadDomainFixtures.withOther(JSON), TransferFixtures.recipients());
    context.getBean(DemoCardSeed.class).initialize();
    context.getBean(DemoRecurringSeed.class).initialize();
    db.update(
        "insert into customer_credentials values(?,?,?,true),(?,?,?,true)",
        ALEX.value(),
        "alex@aster.local",
        credentialHash,
        OTHER.value(),
        "other@aster.local",
        credentialHash);
  }

  RecurringAction executeAuthorized(CustomerId owner, String id, String hash, String key) {
    var session = B4TestVerification.session(context, owner.value());
    var grant =
        B4TestVerification.domainGrant(
            context,
            owner.value(),
            session,
            "RECURRING_PAYMENT_INTENT",
            id,
            hash,
            com.asterbank.banking.security.domain.VerificationAction
                .RECURRING_STOP_FUTURE_PAYMENTS);
    return recurring.execute(owner, id, hash, key, session, grant, null);
  }

  long count(String table) {
    return db.queryForObject("select count(*) from " + table, Long.class);
  }

  SpendingReport report() {
    return spending.query(ALEX, Map.of());
  }

  RecurringIntent prepare() {
    return recurring.prepare(ALEX, "rec_netflix");
  }

  @Test
  void reminderLifecycleIsPersistentTenantBoundAndOnlyNotifiesOnce() {
    var reminders = context.getBean(RenewalReminderService.class);
    var due = "2026-09-27T02:33:00Z";
    var prepared =
        reminders.prepare(
            ALEX.value(),
            Map.of(
                "actionType",
                "CREATE",
                "recurringPaymentId",
                "rec_bookshop",
                "dueAt",
                due,
                "timeZone",
                "UTC"));
    assertThat(count("renewal_reminders")).isZero();
    assertThatThrownBy(() -> reminders.getIntent(OTHER.value(), (String) prepared.get("id")))
        .isInstanceOf(RenewalReminderService.Failure.class);
    var receipt =
        reminders.execute(
            ALEX.value(),
            "create_reminder_1",
            Map.of("intentId", prepared.get("id"), "intentHash", prepared.get("intentHash")));
    assertThat(receipt.get("intentId")).isEqualTo(prepared.get("id"));
    assertThat(
            reminders.execute(
                ALEX.value(),
                "create_reminder_1",
                Map.of("intentId", prepared.get("id"), "intentHash", prepared.get("intentHash"))))
        .isEqualTo(receipt);
    assertThat(count("renewal_reminders")).isEqualTo(1);
    assertThatThrownBy(
            () ->
                reminders.list(OTHER.value()).stream()
                    .filter(
                        r -> r.get("id").equals(((Map<?, ?>) receipt.get("reminder")).get("id")))
                    .findFirst()
                    .orElseThrow())
        .isInstanceOf(NoSuchElementException.class);
    clock.value = Instant.parse("2026-09-27T02:34:00Z");
    assertThat(reminders.processDue()).isEqualTo(1);
    assertThat(reminders.processDue()).isZero();
    assertThat(reminders.notifications(ALEX.value())).hasSize(1);
    assertThat(reminders.notifications(OTHER.value())).isEmpty();
    assertThat(
            reminders.get(ALEX.value(), (String) ((Map<?, ?>) receipt.get("reminder")).get("id")))
        .containsEntry("dateBasis", "ESTIMATED_FROM_HISTORY")
        .containsEntry("status", "TRIGGERED");
  }

  @Test
  void transactionEvidenceCreatesIndependentPatternReminderWithSafeLifecycle() {
    var reminders = context.getBean(RenewalReminderService.class);
    insert(
        "pattern_july",
        "COMPLETED",
        "DEBIT",
        "CARD_PAYMENT",
        "OTHER",
        "merchant_probe",
        "2026-07-10T09:00:00Z");
    insert(
        "pattern_august",
        "COMPLETED",
        "DEBIT",
        "CARD_PAYMENT",
        "OTHER",
        "merchant_probe",
        "2026-08-10T09:00:00Z");
    insert(
        "pattern_september",
        "COMPLETED",
        "DEBIT",
        "CARD_PAYMENT",
        "OTHER",
        "merchant_probe",
        "2026-09-10T09:00:00Z");
    var evidence = List.of("pattern_july", "pattern_august", "pattern_september");
    var request =
        Map.<String, Object>of(
            "actionType", "CREATE",
            "patternEvidenceTransactionIds", evidence,
            "patternCadence", "MONTHLY",
            "dueAt", "2026-09-27T02:33:00Z",
            "timeZone", "UTC");
    var intent = reminders.prepare(ALEX.value(), request);
    assertThat(intent).containsEntry("targetType", "DETECTED_PATTERN");
    assertThat(intent).doesNotContainKey("recurringPaymentId");
    assertThat((String) intent.get("patternReference")).startsWith("pat_");
    assertThat(count("renewal_reminders")).isZero();
    assertThat(count("detected_recurring_patterns")).isEqualTo(1);
    assertThatThrownBy(() -> reminders.prepare(OTHER.value(), request))
        .isInstanceOf(RenewalReminderService.Failure.class);
    var replayPrepare = reminders.prepare(ALEX.value(), request);
    assertThat(replayPrepare.get("patternReference")).isEqualTo(intent.get("patternReference"));
    var created =
        reminders.execute(
            ALEX.value(),
            "pattern_create",
            Map.of("intentId", intent.get("id"), "intentHash", intent.get("intentHash")));
    var reminder = (Map<?, ?>) created.get("reminder");
    assertThat(reminder.get("targetType")).isEqualTo("DETECTED_PATTERN");
    assertThat(reminder.get("dateBasis")).isEqualTo("ESTIMATED_FROM_HISTORY");
    assertThat(reminder.get("patternReference")).isEqualTo(intent.get("patternReference"));
    assertThatThrownBy(
            () ->
                reminders.execute(
                    ALEX.value(),
                    "pattern_duplicate",
                    Map.of(
                        "intentId",
                        replayPrepare.get("id"),
                        "intentHash",
                        replayPrepare.get("intentHash"))))
        .isInstanceOf(RenewalReminderService.Failure.class);
    String reminderId = (String) reminder.get("id");
    assertThat(reminders.list(OTHER.value())).isEmpty();
    var change =
        reminders.prepare(
            ALEX.value(),
            Map.of(
                "actionType",
                "CHANGE",
                "reminderId",
                reminderId,
                "expectedVersion",
                0,
                "dueAt",
                "2026-09-27T02:35:00Z",
                "timeZone",
                "UTC"));
    reminders.execute(
        ALEX.value(),
        "pattern_change",
        Map.of("intentId", change.get("id"), "intentHash", change.get("intentHash")));
    var cancel =
        reminders.prepare(
            ALEX.value(),
            Map.of("actionType", "CANCEL", "reminderId", reminderId, "expectedVersion", 1));
    reminders.execute(
        ALEX.value(),
        "pattern_cancel",
        Map.of("intentId", cancel.get("id"), "intentHash", cancel.get("intentHash")));
    clock.value = Instant.parse("2026-09-27T02:40:00Z");
    assertThat(reminders.processDue()).isZero();
    assertThat(reminders.notifications(ALEX.value())).isEmpty();
    assertThat(reminders.get(ALEX.value(), reminderId)).containsEntry("status", "CANCELLED");
    assertThat(count("recurring_payment_actions")).isZero();
  }

  @Test
  void patternEvidenceRejectsNonDebitNonRecurringAndForeignTransactions() {
    var reminders = context.getBean(RenewalReminderService.class);
    insert(
        "pattern_valid_one",
        "COMPLETED",
        "DEBIT",
        "CARD_PAYMENT",
        "OTHER",
        "merchant_probe",
        "2026-07-10T09:00:00Z");
    insert(
        "pattern_valid_two",
        "COMPLETED",
        "DEBIT",
        "CARD_PAYMENT",
        "OTHER",
        "merchant_probe",
        "2026-08-10T09:00:00Z");
    insert(
        "pattern_invalid_credit",
        "COMPLETED",
        "CREDIT",
        "CARD_PAYMENT",
        "OTHER",
        "merchant_probe",
        "2026-09-10T09:00:00Z");
    var request =
        Map.<String, Object>of(
            "actionType", "CREATE",
            "patternEvidenceTransactionIds",
                List.of("pattern_valid_one", "pattern_valid_two", "pattern_invalid_credit"),
            "patternCadence", "MONTHLY",
            "dueAt", "2026-09-27T02:33:00Z",
            "timeZone", "UTC");
    assertThatThrownBy(() -> reminders.prepare(ALEX.value(), request))
        .isInstanceOf(RenewalReminderService.Failure.class);
    assertThat(count("detected_recurring_patterns")).isZero();
    assertThat(count("renewal_reminders")).isZero();
  }

  @Test
  void patternReminderWorkerNotifiesOnceAndSuppressesStalePrediction() {
    var reminders = context.getBean(RenewalReminderService.class);
    insert(
        "pattern_worker_july",
        "COMPLETED",
        "DEBIT",
        "CARD_PAYMENT",
        "OTHER",
        "merchant_probe",
        "2026-07-10T09:00:00Z");
    insert(
        "pattern_worker_august",
        "COMPLETED",
        "DEBIT",
        "CARD_PAYMENT",
        "OTHER",
        "merchant_probe",
        "2026-08-10T09:00:00Z");
    insert(
        "pattern_worker_september",
        "COMPLETED",
        "DEBIT",
        "CARD_PAYMENT",
        "OTHER",
        "merchant_probe",
        "2026-09-10T09:00:00Z");
    var evidence =
        List.of("pattern_worker_july", "pattern_worker_august", "pattern_worker_september");
    var first =
        reminders.prepare(
            ALEX.value(),
            Map.of(
                "actionType",
                "CREATE",
                "patternEvidenceTransactionIds",
                evidence,
                "patternCadence",
                "MONTHLY",
                "dueAt",
                "2026-09-27T02:33:00Z",
                "timeZone",
                "UTC"));
    var firstAction =
        reminders.execute(
            ALEX.value(),
            "pattern_worker_first",
            Map.of("intentId", first.get("id"), "intentHash", first.get("intentHash")));
    var later =
        reminders.prepare(
            ALEX.value(),
            Map.of(
                "actionType",
                "CREATE",
                "patternEvidenceTransactionIds",
                evidence,
                "patternCadence",
                "MONTHLY",
                "dueAt",
                "2027-01-10T02:33:00Z",
                "timeZone",
                "UTC"));
    var laterAction =
        reminders.execute(
            ALEX.value(),
            "pattern_worker_later",
            Map.of("intentId", later.get("id"), "intentHash", later.get("intentHash")));
    clock.value = Instant.parse("2026-09-27T02:34:00Z");
    assertThat(reminders.processDue()).isEqualTo(1);
    assertThat(reminders.processDue()).isZero();
    assertThat(reminders.notifications(ALEX.value())).hasSize(1);
    assertThat(reminders.notifications(ALEX.value()).getFirst().get("body").toString())
        .contains("estimate");
    assertThat(
            reminders.get(
                ALEX.value(), (String) ((Map<?, ?>) firstAction.get("reminder")).get("id")))
        .containsEntry("status", "TRIGGERED");
    clock.value = Instant.parse("2027-01-10T02:34:00Z");
    assertThat(reminders.processDue()).isZero();
    assertThat(reminders.notifications(ALEX.value())).hasSize(1);
    assertThat(
            reminders.get(
                ALEX.value(), (String) ((Map<?, ?>) laterAction.get("reminder")).get("id")))
        .containsEntry("status", "CANCELLED");
    assertThat(db.queryForObject("select status from detected_recurring_patterns", String.class))
        .isEqualTo("STALE");
  }

  @Test
  void cancelledRecurringIntentNeverStopsBankArrangement() {
    var intent = recurring.prepare(ALEX, "rec_rent");
    var cancelled = recurring.cancel(ALEX, intent.terms().id());
    assertThat(cancelled.status()).isEqualTo(RecurringIntent.Status.CANCELLED);
    assertThat(recurring.cancel(ALEX, intent.terms().id()).status())
        .isEqualTo(RecurringIntent.Status.CANCELLED);
    failure(
        () ->
            executeAuthorized(ALEX, intent.terms().id(), intent.intentHash(), "cancelled_attempt"),
        "RECURRING_PAYMENT_INTENT_CANCELLED");
    assertThat(recurring.detail(ALEX, "rec_rent").status())
        .isEqualTo(RecurringPayment.Status.ACTIVE);
    assertThat(count("recurring_payment_actions")).isZero();
  }

  @Test
  void cancelAndExecuteRecurringIntentRaceHasOneTerminalOutcome() throws Exception {
    var intent = recurring.prepare(ALEX, "rec_rent");
    var session = B4TestVerification.session(context, ALEX.value());
    var grant =
        B4TestVerification.domainGrant(
            context,
            ALEX.value(),
            session,
            "RECURRING_PAYMENT_INTENT",
            intent.terms().id(),
            intent.intentHash(),
            com.asterbank.banking.security.domain.VerificationAction
                .RECURRING_STOP_FUTURE_PAYMENTS);
    var gate = new CountDownLatch(1);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var cancel =
          pool.submit(
              () -> {
                gate.await();
                return recurring.cancel(ALEX, intent.terms().id()).status();
              });
      var execute =
          pool.submit(
              () -> {
                gate.await();
                try {
                  recurring.execute(
                      ALEX,
                      intent.terms().id(),
                      intent.intentHash(),
                      "race_stop",
                      session,
                      grant,
                      null);
                  return true;
                } catch (RecurringFailure e) {
                  assertThat(e.code().name()).isEqualTo("RECURRING_PAYMENT_INTENT_CANCELLED");
                  return false;
                }
              });
      gate.countDown();
      var finalStatus = cancel.get(15, TimeUnit.SECONDS);
      var didExecute = execute.get(15, TimeUnit.SECONDS);
      assertThat(finalStatus)
          .isEqualTo(
              didExecute ? RecurringIntent.Status.EXECUTED : RecurringIntent.Status.CANCELLED);
      assertThat(recurring.detail(ALEX, "rec_rent").status())
          .isEqualTo(didExecute ? RecurringPayment.Status.STOPPED : RecurringPayment.Status.ACTIVE);
      assertThat(count("recurring_payment_actions")).isEqualTo(didExecute ? 1 : 0);
    }
  }

  @Test
  void reminderChangeCancelAndStaleVersionNeverCreateExtraNotice() {
    var reminders = context.getBean(RenewalReminderService.class);
    var initial =
        reminders.prepare(
            ALEX.value(),
            Map.of(
                "actionType",
                "CREATE",
                "recurringPaymentId",
                "rec_rent",
                "dueAt",
                "2026-09-27T02:33:00Z",
                "timeZone",
                "UTC"));
    var created =
        reminders.execute(
            ALEX.value(),
            "reminder_create",
            Map.of("intentId", initial.get("id"), "intentHash", initial.get("intentHash")));
    var row = (Map<?, ?>) created.get("reminder");
    String reminderId = (String) row.get("id");
    var change =
        reminders.prepare(
            ALEX.value(),
            Map.of(
                "actionType",
                "CHANGE",
                "recurringPaymentId",
                "rec_rent",
                "reminderId",
                reminderId,
                "expectedVersion",
                0,
                "dueAt",
                "2026-09-27T02:40:00Z",
                "timeZone",
                "UTC"));
    var changed =
        reminders.execute(
            ALEX.value(),
            "reminder_change",
            Map.of("intentId", change.get("id"), "intentHash", change.get("intentHash")));
    assertThat(
            reminders.execute(
                ALEX.value(),
                "reminder_change",
                Map.of("intentId", change.get("id"), "intentHash", change.get("intentHash"))))
        .isEqualTo(changed);
    assertThat(((Map<?, ?>) changed.get("reminder")).get("version")).isEqualTo(1);
    assertThatThrownBy(
            () ->
                reminders.execute(
                    ALEX.value(),
                    "stale_change",
                    Map.of("intentId", change.get("id"), "intentHash", change.get("intentHash"))))
        .isInstanceOf(RenewalReminderService.Failure.class);
    var cancel =
        reminders.prepare(
            ALEX.value(),
            Map.of(
                "actionType",
                "CANCEL",
                "recurringPaymentId",
                "rec_rent",
                "reminderId",
                reminderId,
                "expectedVersion",
                1));
    var cancelled =
        reminders.execute(
            ALEX.value(),
            "reminder_cancel",
            Map.of("intentId", cancel.get("id"), "intentHash", cancel.get("intentHash")));
    assertThat(
            reminders.execute(
                ALEX.value(),
                "reminder_cancel",
                Map.of("intentId", cancel.get("id"), "intentHash", cancel.get("intentHash"))))
        .isEqualTo(cancelled);
    clock.value = Instant.parse("2026-09-27T02:50:00Z");
    assertThat(reminders.processDue()).isZero();
    assertThat(reminders.notifications(ALEX.value())).isEmpty();
    assertThat(reminders.get(ALEX.value(), reminderId)).containsEntry("status", "CANCELLED");
  }

  @Test
  void changingReminderTargetAtomicallyRebindsItAndInvalidatesOldIntent() {
    var reminders = context.getBean(RenewalReminderService.class);
    var create =
        reminders.prepare(
            ALEX.value(),
            Map.of(
                "actionType",
                "CREATE",
                "recurringPaymentId",
                "rec_rent",
                "dueAt",
                "2026-09-27T02:33:00Z",
                "timeZone",
                "UTC"));
    var created =
        reminders.execute(
            ALEX.value(),
            "target_create",
            Map.of("intentId", create.get("id"), "intentHash", create.get("intentHash")));
    String reminderId = (String) ((Map<?, ?>) created.get("reminder")).get("id");
    var oldChange =
        reminders.prepare(
            ALEX.value(),
            Map.of(
                "actionType",
                "CHANGE",
                "reminderId",
                reminderId,
                "expectedVersion",
                0,
                "dueAt",
                "2026-09-27T02:40:00Z",
                "timeZone",
                "UTC"));
    var retarget =
        reminders.prepare(
            ALEX.value(),
            Map.of(
                "actionType",
                "CHANGE",
                "reminderId",
                reminderId,
                "expectedVersion",
                0,
                "recurringPaymentId",
                "rec_netflix",
                "dueAt",
                "2026-09-27T02:45:00Z",
                "timeZone",
                "UTC"));
    assertThatThrownBy(
            () ->
                reminders.prepare(
                    OTHER.value(),
                    Map.of(
                        "actionType",
                        "CHANGE",
                        "reminderId",
                        reminderId,
                        "expectedVersion",
                        0,
                        "recurringPaymentId",
                        "rec_netflix",
                        "dueAt",
                        "2026-09-27T02:45:00Z",
                        "timeZone",
                        "UTC")))
        .isInstanceOf(RenewalReminderService.Failure.class);
    var changed =
        reminders.execute(
            ALEX.value(),
            "target_change",
            Map.of("intentId", retarget.get("id"), "intentHash", retarget.get("intentHash")));
    var row = (Map<?, ?>) changed.get("reminder");
    assertThat(row.get("recurringPaymentId")).isEqualTo("rec_netflix");
    assertThat(row.get("version")).isEqualTo(1);
    assertThat(
            db.queryForObject(
                "SELECT COUNT(*) FROM renewal_reminders WHERE reminder_id=? AND recurring_payment_id='rec_rent' AND status='ACTIVE'",
                Integer.class,
                reminderId))
        .isZero();
    assertThatThrownBy(
            () ->
                reminders.execute(
                    ALEX.value(),
                    "old_target_change",
                    Map.of(
                        "intentId",
                        oldChange.get("id"),
                        "intentHash",
                        oldChange.get("intentHash"))))
        .isInstanceOf(RenewalReminderService.Failure.class);
    insert(
        "target_pattern_july",
        "COMPLETED",
        "DEBIT",
        "CARD_PAYMENT",
        "OTHER",
        "merchant_probe",
        "2026-07-10T09:00:00Z");
    insert(
        "target_pattern_august",
        "COMPLETED",
        "DEBIT",
        "CARD_PAYMENT",
        "OTHER",
        "merchant_probe",
        "2026-08-10T09:00:00Z");
    insert(
        "target_pattern_september",
        "COMPLETED",
        "DEBIT",
        "CARD_PAYMENT",
        "OTHER",
        "merchant_probe",
        "2026-09-10T09:00:00Z");
    var patternChange =
        reminders.prepare(
            ALEX.value(),
            Map.of(
                "actionType",
                "CHANGE",
                "reminderId",
                reminderId,
                "expectedVersion",
                1,
                "patternEvidenceTransactionIds",
                List.of("target_pattern_july", "target_pattern_august", "target_pattern_september"),
                "patternCadence",
                "MONTHLY",
                "dueAt",
                "2026-09-27T02:50:00Z",
                "timeZone",
                "UTC"));
    var patternReceipt =
        reminders.execute(
            ALEX.value(),
            "target_pattern_change",
            Map.of(
                "intentId",
                patternChange.get("id"),
                "intentHash",
                patternChange.get("intentHash")));
    assertThat(((Map<?, ?>) patternReceipt.get("reminder")).get("targetType"))
        .isEqualTo("DETECTED_PATTERN");
    assertThat(((Map<?, ?>) patternReceipt.get("reminder")).get("version")).isEqualTo(2);
    assertThat(
            db.queryForObject(
                "SELECT COUNT(*) FROM renewal_reminders WHERE reminder_id=? AND recurring_payment_id IS NOT NULL AND status='ACTIVE'",
                Integer.class,
                reminderId))
        .isZero();
  }

  @Test
  void cancellingPreparedReminderIntentCannotExecuteIt() {
    var reminders = context.getBean(RenewalReminderService.class);
    var intent =
        reminders.prepare(
            ALEX.value(),
            Map.of(
                "actionType",
                "CREATE",
                "recurringPaymentId",
                "rec_rent",
                "dueAt",
                "2026-09-27T02:33:00Z",
                "timeZone",
                "UTC"));
    assertThat(reminders.cancelIntent(ALEX.value(), (String) intent.get("id")))
        .containsEntry("status", "CANCELLED");
    assertThatThrownBy(
            () ->
                reminders.execute(
                    ALEX.value(),
                    "cancelled_reminder",
                    Map.of("intentId", intent.get("id"), "intentHash", intent.get("intentHash"))))
        .isInstanceOf(RenewalReminderService.Failure.class);
    assertThat(count("renewal_reminders")).isZero();
  }

  RecurringAction execute(RecurringIntent i, String key) {
    return executeAuthorized(ALEX, i.terms().id(), i.intentHash(), key);
  }

  void failure(Runnable run, String code) {
    assertThatThrownBy(run::run).isInstanceOf(RecurringFailure.class).hasMessage(code);
  }

  String financial() {
    return JSON.writeValueAsString(
        List.of(
            db.queryForList("select * from accounts order by account_id"),
            db.queryForList("select * from transactions order by transaction_id"),
            db.queryForList("select * from cards order by card_id")));
  }

  @Test
  void standardDefaultTotalsAndSqlBreakdowns() {
    var r = report();
    assertThat(r.totalSpend()).isEqualByComparingTo("4968.00");
    assertThat(r.comparisonTotalSpend()).isEqualByComparingTo("4800.00");
    assertThat(r.absoluteChange()).isEqualByComparingTo("168.00");
    assertThat(r.percentageChange()).isEqualTo("3.50");
    assertThat(
            r.categoryBreakdown().stream()
                .map(SpendingReport.Category::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add))
        .isEqualByComparingTo(r.totalSpend());
    assertThat(
            r.trend().stream()
                .map(SpendingReport.Trend::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add))
        .isEqualByComparingTo(r.totalSpend());
    assertThat(
            r.categoryBreakdown().stream()
                .mapToLong(SpendingReport.Category::transactionCount)
                .sum())
        .isEqualTo(r.transactionCount());
    assertThat(r.trend().stream().mapToLong(SpendingReport.Trend::transactionCount).sum())
        .isEqualTo(r.transactionCount());
    assertThat(r.categoryBreakdown()).extracting(SpendingReport.Category::category).isSorted();
    assertThat(r.trend()).hasSize(27);
    assertThat(r.trend().getFirst().period().from().toInstant())
        .isEqualTo(Instant.parse("2026-08-31T16:00:00Z"));
    assertThat(r.trend().getLast().period().to().toInstant()).isEqualTo(clock.instant());
    for (int n = 1; n < r.trend().size(); n++)
      assertThat(r.trend().get(n - 1).period().to().toInstant())
          .isEqualTo(r.trend().get(n).period().from().toInstant());
    assertThat(r.topMerchants())
        .isSortedAccordingTo(
            Comparator.comparing(SpendingReport.Merchant::amount)
                .reversed()
                .thenComparing(SpendingReport.Merchant::merchantId));
    assertThat(r.asOf().toInstant()).isEqualTo(clock.instant());
  }

  @Test
  void zeroAmountCategoryHasZeroPercentageAndEmptyDaysRemainPresent() {
    insert("zero", "COMPLETED", "DEBIT", "FEE", "OTHER", null, "2027-01-01T12:00:00+08:00");
    db.update("update transactions set amount=0 where transaction_id='zero'");
    var report =
        spending.query(
            ALEX, Map.of("from", "2027-01-01T00:00:00+08:00", "to", "2027-01-03T00:00:00+08:00"));
    assertThat(report.totalSpend()).isZero();
    assertThat(report.trend()).hasSize(2);
    assertThat(report.trend().getLast().transactionCount()).isZero();
    var wire = com.asterbank.banking.customer.spending.adapter.web.SpendingMapper.summary(report);
    assertThat(wire.getCategoryBreakdown().getFirst().getPercentage()).isEqualTo("0.00");
  }

  @Test
  void reportingOffsetIsFixedEvenForHistoricalDaylightSavingDates() {
    insert(
        "old_offset",
        "COMPLETED",
        "DEBIT",
        "CARD_PAYMENT",
        "OTHER",
        null,
        "1990-07-01T23:30:00+08:00");
    var r =
        spending.query(
            ALEX, Map.of("from", "1990-07-01T00:00:00+08:00", "to", "1990-07-03T00:00:00+08:00"));
    assertThat(r.totalSpend()).isEqualByComparingTo("10.00");
    assertThat(r.trend().getFirst().amount()).isEqualByComparingTo("10.00");
    assertThat(r.trend().getLast().amount()).isZero();
  }

  @Test
  void explicitPeriodsFullAugustAndZeroComparison() {
    var r =
        spending.query(
            ALEX,
            Map.of(
                "from",
                "2026-08-01T00:00:00+08:00",
                "to",
                "2026-09-01T00:00:00+08:00",
                "compareFrom",
                "2025-08-01T00:00:00+08:00",
                "compareTo",
                "2025-09-01T00:00:00+08:00"));
    assertThat(r.totalSpend()).isEqualByComparingTo("5400");
    assertThat(r.comparisonTotalSpend()).isZero();
    assertThat(r.percentageChange()).isNull();
  }

  @Test
  void accountCurrencyScopeAndCustomerIsolation() {
    var usd = spending.query(ALEX, Map.of("accountId", "acc_usd"));
    assertThat(usd.currency()).isEqualTo("USD");
    assertThat(usd.accountIds()).containsExactly("acc_usd");
    var saving = spending.query(ALEX, Map.of("accountId", "acc_savings"));
    assertThat(saving.accountIds()).containsExactly("acc_savings");
    for (String id : List.of("acc_other", "unknown"))
      assertThatThrownBy(() -> spending.query(ALEX, Map.of("accountId", id)))
          .isInstanceOf(SpendingFailure.class)
          .hasMessage("ACCOUNT_NOT_FOUND");
    assertThat(spending.query(OTHER, Map.of()).accountIds()).containsExactly("acc_other");
    assertThat(spending.query(OTHER, Map.of()).totalSpend())
        .isNotEqualByComparingTo(report().totalSpend());
  }

  void insert(
      String id,
      String status,
      String direction,
      String type,
      String category,
      String merchant,
      String at) {
    db.update(
        """
 INSERT INTO transactions(transaction_id,customer_id,account_id,title,amount,currency,direction,status,type,category,occurred_at,booked_at,merchant_id,merchant_name,title_search)
 VALUES(?,'usr_aster_alex','acc_current','Analytics probe',10.00,'CNY',?,?,?,?,cast(? AS timestamptz),cast(? AS timestamptz),?,?,'analytics probe')
 """,
        id,
        direction,
        status,
        type,
        category,
        at,
        at,
        merchant,
        merchant == null ? null : "Probe");
  }

  @ParameterizedTest
  @CsvSource({
    "COMPLETED,DEBIT,CARD_PAYMENT,DINING,true",
    "COMPLETED,DEBIT,DIRECT_DEBIT,HOUSING,true",
    "COMPLETED,DEBIT,FEE,OTHER,true",
    "COMPLETED,DEBIT,BANK_TRANSFER,TRANSFER,false",
    "COMPLETED,DEBIT,CASH_WITHDRAWAL,OTHER,false",
    "COMPLETED,CREDIT,SALARY,INCOME,false",
    "COMPLETED,CREDIT,CARD_PAYMENT,DINING,false",
    "PENDING,DEBIT,CARD_PAYMENT,DINING,false",
    "FAILED,DEBIT,CARD_PAYMENT,DINING,false",
    "REVERSED,DEBIT,CARD_PAYMENT,DINING,false",
    "CANCELLED,DEBIT,CARD_PAYMENT,DINING,false",
    "COMPLETED,DEBIT,INVESTMENT_PURCHASE,INVESTMENT,false",
    "COMPLETED,DEBIT,CARD_PAYMENT,TRANSFER,false",
    "COMPLETED,DEBIT,FEE,INVESTMENT,false",
    "COMPLETED,DEBIT,FX_EXCHANGE,OTHER,false"
  })
  void sqlEligibilityAndSourceChanges(
      String status, String direction, String type, String category, boolean eligible) {
    var before = report();
    insert("probe", status, direction, type, category, null, "2026-09-20T12:00:00+08:00");
    var after = report();
    assertThat(after.totalSpend())
        .isEqualByComparingTo(
            before.totalSpend().add(eligible ? new BigDecimal("10.00") : BigDecimal.ZERO));
    assertThat(after.transactionCount()).isEqualTo(before.transactionCount() + (eligible ? 1 : 0));
    assertThat(after.topMerchants()).isEqualTo(before.topMerchants());
  }

  @Test
  void boundariesOffsetBucketsAndMerchantTies() {
    insert(
        "start",
        "COMPLETED",
        "DEBIT",
        "CARD_PAYMENT",
        "OTHER",
        "z_probe",
        "2026-09-25T00:00:00+08:00");
    insert(
        "middle", "COMPLETED", "DEBIT", "CARD_PAYMENT", "OTHER", "a_probe", "2026-09-25T16:00:00Z");
    insert(
        "end",
        "COMPLETED",
        "DEBIT",
        "CARD_PAYMENT",
        "OTHER",
        "end_probe",
        "2026-09-27T00:00:00+08:00");
    var r =
        spending.query(
            ALEX, Map.of("from", "2026-09-25T00:00:00+08:00", "to", "2026-09-27T00:00:00+08:00"));
    assertThat(r.topMerchants())
        .extracting(SpendingReport.Merchant::merchantId)
        .doesNotContain("end_probe");
    var probes = r.topMerchants().stream().filter(m -> m.merchantId().endsWith("_probe")).toList();
    assertThat(probes)
        .extracting(SpendingReport.Merchant::merchantId)
        .containsExactly("a_probe", "z_probe");
    assertThat(r.trend()).hasSize(2);
  }

  @Test
  void listDetailHistoryAndBookshopProvenance() {
    assertThat(recurring.list(ALEX))
        .extracting(RecurringPayment::displayName)
        .containsExactly("Rent", "Netflix", "Spotify", "Adobe", "ChatGPT", "Bookshop");
    var netflix = recurring.detail(ALEX, "rec_netflix");
    assertThat(netflix.usualAmount().decimal()).isEqualTo("88.00");
    assertThat(netflix.transactionHistory())
        .containsExactly("txn_rec_netflix", "txn_aug_rec_netflix");
    var book = recurring.detail(ALEX, "rec_bookshop");
    assertThat(book.transactionHistory())
        .containsExactly("txn_jun_bookshop", "txn_jul_bookshop", "txn_history_0_00");
    assertThat(book.detectionProvenance().matchedTransactionIds())
        .isEqualTo(book.transactionHistory());
    assertThat(book.detectionProvenance().observedOccurrences()).isEqualTo(3);
    assertThat(book.nextExpectedAt()).isNull();
    failure(() -> recurring.prepare(ALEX, book.id()), "RECURRING_PAYMENT_NOT_MANAGEABLE");
    assertThat(count("recurring_payment_action_intents")).isZero();
  }

  @Test
  void prepareOnlyPersistsImmutableReview() {
    var before = recurring.detail(ALEX, "rec_netflix");
    var finance = financial();
    var r = report();
    var i = prepare();
    assertThat(recurring.detail(ALEX, "rec_netflix")).isEqualTo(before);
    assertThat(financial()).isEqualTo(finance);
    assertThat(report()).isEqualTo(r);
    assertThat(count("recurring_payment_actions")).isZero();
    assertThat(count("action_authorizations")).isZero();
    assertThat(i.terms().after().status()).isEqualTo(RecurringPayment.Status.STOPPED);
    assertThat(i.terms().after().nextExpectedAt()).isNull();
    assertThat(i.terms().effectDescription()).contains("through Aster Bank");
    db.update(
        "update recurring_payments set display_name='Changed' where recurring_payment_id='rec_netflix'");
    assertThat(recurring.intent(ALEX, i.terms().id())).isEqualTo(i);
    failure(() -> execute(i, "stale"), "RECURRING_PAYMENT_STATE_CHANGED");
  }

  @Test
  void stopPreservesHistoricalFinancialStateAndConsumesOnlyItsGrant() {
    var before = recurring.detail(ALEX, "rec_netflix");
    var finance = financial();
    var report = report();
    var i = prepare();
    var a = execute(i, "stop");
    var after = recurring.detail(ALEX, "rec_netflix");
    assertThat(after.status()).isEqualTo(RecurringPayment.Status.STOPPED);
    assertThat(after.nextExpectedAt()).isNull();
    assertThat(after.lastPaidAt()).isEqualTo(before.lastPaidAt());
    assertThat(after.transactionHistory()).isEqualTo(before.transactionHistory());
    assertThat(after.version()).isEqualTo(before.version() + 1);
    assertThat(financial()).isEqualTo(finance);
    assertThat(report()).isEqualTo(report);
    assertThat(recurring.action(ALEX, a.id())).isEqualTo(a);
    assertThat(
            db.queryForObject(
                "select count(*) from action_authorizations where status='CONSUMED'", Long.class))
        .isEqualTo(1);
    assertThat(
            db.queryForObject(
                "select count(*) from step_up_challenges where status='VERIFIED'", Long.class))
        .isEqualTo(1);
    assertThat(
            db.queryForObject(
                "select count(*) from security_events where type='AUTHORIZATION_CONSUMED'",
                Long.class))
        .isEqualTo(1);
    failure(() -> recurring.prepare(ALEX, "rec_netflix"), "RECURRING_PAYMENT_ALREADY_STOPPED");
  }

  @Test
  void replayPrecedesStoppedExpiredChecksAndConflictsReject() {
    var i = prepare();
    var receipt = execute(i, "same");
    clock.value = clock.value.plusSeconds(1000);
    assertThat(execute(i, "same")).isEqualTo(receipt);
    failure(
        () -> executeAuthorized(ALEX, i.terms().id(), "different", "same"),
        "IDEMPOTENCY_KEY_REUSED");
    var other = recurring.prepare(ALEX, "rec_spotify");
    failure(() -> execute(other, "same"), "IDEMPOTENCY_KEY_REUSED");
    failure(() -> execute(i, "different"), "RECURRING_PAYMENT_INTENT_ALREADY_EXECUTED");
  }

  @Test
  void hashExpiryAndForeignReferencesReject() {
    var i = prepare();
    failure(
        () -> executeAuthorized(ALEX, i.terms().id(), "bad", "key"),
        "RECURRING_PAYMENT_INTENT_HASH_MISMATCH");
    clock.value = i.terms().expiresAt().toInstant();
    assertThat(recurring.intent(ALEX, i.terms().id()).status())
        .isEqualTo(RecurringIntent.Status.EXPIRED);
    failure(() -> execute(i, "key"), "RECURRING_PAYMENT_INTENT_EXPIRED");
    assertThat(recurring.list(OTHER)).isEmpty();
    failure(() -> recurring.detail(OTHER, "rec_netflix"), "RECURRING_PAYMENT_NOT_FOUND");
    failure(() -> recurring.intent(OTHER, i.terms().id()), "RECURRING_PAYMENT_INTENT_NOT_FOUND");
    failure(
        () -> executeAuthorized(OTHER, i.terms().id(), i.intentHash(), "key"),
        "RECURRING_PAYMENT_INTENT_NOT_FOUND");
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "status='ENDED'",
        "management_capability='NONE'",
        "usual_amount=99",
        "source='DETECTED_PATTERN',management_capability='NONE',observed_occurrences=2,first_observed_at=last_paid_at,last_observed_at=last_paid_at",
        "business_version=1",
        "next_expected_at=next_expected_at+interval '1 day'"
      })
  void executionRevalidatesAllReviewedTerms(String update) {
    var i = prepare();
    if (update.startsWith("source=")) {
      db.update(
          "update recurring_payment_transaction_links set matched=true where recurring_payment_id='rec_netflix'");
    }
    db.update(
        "update recurring_payments set " + update + " where recurring_payment_id='rec_netflix'");
    failure(() -> execute(i, "stale"), "RECURRING_PAYMENT_STATE_CHANGED");
    assertThat(count("recurring_payment_actions")).isZero();
  }

  @ParameterizedTest
  @EnumSource(RecurringExecutionCheckpoint.Stage.class)
  void failureRollsBackEverythingAndRetrySucceeds(RecurringExecutionCheckpoint.Stage stage) {
    var i = prepare();
    var before = recurring.detail(ALEX, "rec_netflix");
    var finance = financial();
    fault.failAt = stage;
    failure(() -> execute(i, "retry"), "PERSISTENCE_UNAVAILABLE");
    assertThat(recurring.detail(ALEX, "rec_netflix")).isEqualTo(before);
    assertThat(recurring.intent(ALEX, i.terms().id())).isEqualTo(i);
    assertThat(count("recurring_payment_actions")).isZero();
    assertThat(count("idempotency_records")).isZero();
    assertThat(financial()).isEqualTo(finance);
    fault.failAt = null;
    assertThat(execute(i, "retry").payment().status()).isEqualTo(RecurringPayment.Status.STOPPED);
  }

  @Test
  void actualDatabaseFailureAtFinalInsertRollsBack() {
    var i = prepare();
    db.execute(
        "alter table idempotency_records add constraint test_reject_recurring check(operation<>'EXECUTE_RECURRING_PAYMENT_ACTION')");
    try {
      failure(() -> execute(i, "db_failure"), "PERSISTENCE_UNAVAILABLE");
      assertThat(recurring.detail(ALEX, "rec_netflix").status())
          .isEqualTo(RecurringPayment.Status.ACTIVE);
      assertThat(recurring.intent(ALEX, i.terms().id())).isEqualTo(i);
      assertThat(count("recurring_payment_actions")).isZero();
    } finally {
      db.execute("alter table idempotency_records drop constraint test_reject_recurring");
    }
    execute(i, "db_failure");
  }

  List<Object> race(Callable<RecurringAction> a, Callable<RecurringAction> b) throws Exception {
    var gate = new CountDownLatch(1);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var tasks =
          List.of(a, b).stream()
              .map(
                  task ->
                      pool.submit(
                          () -> {
                            gate.await();
                            try {
                              return (Object) task.call();
                            } catch (RecurringFailure e) {
                              return e.code().name();
                            }
                          }))
              .toList();
      gate.countDown();
      var out = new ArrayList<Object>();
      for (var task : tasks) out.add(task.get(15, TimeUnit.SECONDS));
      return out;
    }
  }

  @Test
  void concurrentSameKeyReturnsSameReceipt() throws Exception {
    var i = prepare();
    var results = race(() -> execute(i, "same"), () -> execute(i, "same"));
    assertThat(results.get(0)).isEqualTo(results.get(1)).isInstanceOf(RecurringAction.class);
    assertThat(count("recurring_payment_actions")).isEqualTo(1);
  }

  @Test
  void concurrentDifferentKeysOneLogicalAction() throws Exception {
    var i = prepare();
    var results = race(() -> execute(i, "a"), () -> execute(i, "b"));
    assertThat(results.stream().filter(RecurringAction.class::isInstance).count()).isEqualTo(1);
    assertThat(results).contains("RECURRING_PAYMENT_INTENT_ALREADY_EXECUTED");
    assertThat(count("idempotency_records")).isEqualTo(1);
  }

  @Test
  void competingIntentsOneTransition() throws Exception {
    var a = prepare();
    var b = prepare();
    var results = race(() -> execute(a, "a"), () -> execute(b, "b"));
    assertThat(results.stream().filter(RecurringAction.class::isInstance).count()).isEqualTo(1);
    assertThat(results).contains("RECURRING_PAYMENT_STATE_CHANGED");
    assertThat(recurring.detail(ALEX, "rec_netflix").version()).isEqualTo(1);
  }

  @Test
  void crossDomainMutationsNeverRewriteSpending() {
    var baseline = report();
    var transferSession = B4TestVerification.session(context, ALEX.value());
    var transfer =
        context
            .getBean(TransferPreparationService.class)
            .prepare(
                ALEX,
                new PrepareTransfer(
                    new AccountId("acc_current"),
                    new RecipientId("recipient_zhang"),
                    Money.of("500.00", "CNY"),
                    "M18"),
                transferSession);
    context
        .getBean(TransferExecutionService.class)
        .execute(
            ALEX,
            transfer.terms().id(),
            transfer.intentHash(),
            "cross",
            transferSession,
            B4TestVerification.domainGrant(
                context,
                ALEX.value(),
                transferSession,
                "TRANSFER_INTENT",
                transfer.terms().id(),
                transfer.intentHash(),
                com.asterbank.banking.security.domain.VerificationAction.TRANSFER_EXECUTE),
            null);
    assertThat(report()).isEqualTo(baseline);
    var cards = context.getBean(CardService.class);
    var freeze = cards.prepare(ALEX, "card_aster_debit", CardActionType.FREEZE, null);
    cards.execute(ALEX, "session", freeze.terms().id(), freeze.intentHash(), null, "cross", null);
    assertThat(report()).isEqualTo(baseline);
    var security = context.getBean(SecurityService.class);
    String session = UUID.randomUUID().toString();
    security.login(ALEX.value(), session, null);
    var unfreeze = cards.prepare(ALEX, "card_aster_debit", CardActionType.UNFREEZE, null);
    var binding =
        new Binding(
            ALEX.value(),
            session,
            "CARD_ACTION_INTENT",
            unfreeze.terms().id(),
            unfreeze.intentHash());
    var challenge = B4TestVerification.create(db, security, binding, null);
    var verified =
        B4TestVerification.verify(
            db, security, ALEX.value(), session, challenge.id(), "246810", null);
    cards.execute(
        ALEX,
        session,
        unfreeze.terms().id(),
        unfreeze.intentHash(),
        verified.authorization().id(),
        "unfreeze",
        null);
    assertThat(report()).isEqualTo(baseline);
    execute(prepare(), "cross");
    assertThat(report()).isEqualTo(baseline);
    assertThat(count("idempotency_records")).isEqualTo(4);
  }

  static final class Browser implements AutoCloseable {
    final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();

    HttpResponse<String> call(String method, String path, Object body, String key, boolean csrf)
        throws Exception {
      var r =
          HttpRequest.newBuilder(URI.create(base + path))
              .timeout(Duration.ofSeconds(20))
              .header("Content-Type", "application/json");
      if (key != null) r.header("Idempotency-Key", key);
      if (csrf)
        cookies.getCookieStore().getCookies().stream()
            .filter(c -> c.getName().equals("XSRF-TOKEN") && !c.hasExpired())
            .findFirst()
            .ifPresent(c -> r.header("X-XSRF-TOKEN", c.getValue()));
      return client.send(
          r.method(
                  method,
                  body == null
                      ? HttpRequest.BodyPublishers.noBody()
                      : HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)))
              .build(),
          HttpResponse.BodyHandlers.ofString());
    }

    JsonNode checked(HttpResponse<String> r, int code) {
      assertThat(r.statusCode()).as(r.body()).isEqualTo(code);
      return JSON.readTree(r.body());
    }

    JsonNode get(String p, int code) throws Exception {
      return checked(call("GET", p, null, null, false), code);
    }

    final java.util.Map<String, String> verifiedGrants = new java.util.HashMap<>();

    JsonNode post(String p, Object body, String key, int code) throws Exception {
      body =
          JSON.readTree(
              B4TestVerification.verifiedBody(
                  db,
                  path -> call("GET", path, null, null, false),
                  (path, value) -> call("POST", path, JSON.readTree(value), null, true),
                  p,
                  JSON.writeValueAsString(body),
                  verifiedGrants));
      return checked(call("POST", p, body, key, true), code);
    }

    void login(String email) throws Exception {
      get("/customer/session", 401);
      post("/customer/auth/login", Map.of("email", email, "password", "demo-password"), null, 200);
      get("/customer/session", 200);
    }

    public void close() {
      client.close();
    }
  }

  @Test
  void realHttpRenewalReminderRequiresSessionCsrfAndOwnerAndReplaysOnce() throws Exception {
    try (var alex = new Browser();
        var other = new Browser()) {
      assertThat(alex.get("/customer/renewal-reminders", 401)).isNotNull();
      alex.login("alex@aster.local");
      var body =
          Map.of(
              "actionType", "CREATE",
              "recurringPaymentId", "rec_netflix",
              "dueAt", "2026-09-28T12:00:00+08:00",
              "timeZone", "Asia/Hong_Kong");
      assertThat(
              alex.call("POST", "/customer/renewal-reminder-action-intents", body, null, false)
                  .statusCode())
          .isEqualTo(403);
      var intent = alex.post("/customer/renewal-reminder-action-intents", body, null, 201);
      assertThat(intent.path("status").asText()).isEqualTo("PREPARED");
      assertThat(intent.path("dateBasis").asText()).isEqualTo("BANK_SCHEDULE");
      var terms =
          Map.of(
              "intentId",
              intent.path("id").asText(),
              "intentHash",
              intent.path("intentHash").asText());
      var action = alex.post("/customer/renewal-reminder-actions", terms, "reminder_http", 200);
      assertThat(alex.post("/customer/renewal-reminder-actions", terms, "reminder_http", 200))
          .isEqualTo(action);
      var reminderId = action.path("reminder").path("id").asText();
      assertThat(alex.get("/customer/renewal-reminders/" + reminderId, 200).path("status").asText())
          .isEqualTo("ACTIVE");
      assertThat(alex.get("/customer/in-app-notifications", 200).path("items")).isEmpty();
      other.login("other@aster.local");
      other.get("/customer/renewal-reminders/" + reminderId, 404);
      other.get("/customer/renewal-reminder-action-intents/" + intent.path("id").asText(), 404);
      assertThat(
              db.queryForObject(
                  "SELECT count(*) FROM renewal_reminder_actions WHERE customer_id=? AND intent_id=?",
                  Long.class,
                  ALEX.value(),
                  intent.path("id").asText()))
          .isEqualTo(1);
    }
  }

  @Test
  void realHttpStandardSpendingNetflixStopReplayAndSecurity() throws Exception {
    try (var b = new Browser()) {
      b.get("/customer/spending/summary", 401);
      b.get("/customer/recurring-payments", 401);
      b.login("alex@aster.local");
      var before = b.get("/customer/spending/summary", 200);
      assertThat(before.path("totalSpend").path("amount").asText()).isEqualTo("4968.00");
      assertThat(before.path("percentageChange").asText()).isEqualTo("3.50");
      assertThat(b.get("/customer/recurring-payments", 200).path("items")).hasSize(6);
      var request =
          Map.of("recurringPaymentId", "rec_netflix", "actionType", "STOP_FUTURE_PAYMENTS");
      assertThat(
              b.call("POST", "/customer/recurring-payment-action-intents", request, null, false)
                  .statusCode())
          .isEqualTo(403);
      var i = b.post("/customer/recurring-payment-action-intents", request, null, 201);
      assertThat(i.path("authorizationRequirement").asText()).isEqualTo("CONFIRMATION");
      assertThat(b.get("/customer/recurring-payment-action-intents/" + i.path("id").asText(), 200))
          .isEqualTo(i);
      var exec =
          Map.of("intentId", i.path("id").asText(), "intentHash", i.path("intentHash").asText());
      assertThat(
              b.call("POST", "/customer/recurring-payment-actions", exec, "http", false)
                  .statusCode())
          .isEqualTo(403);
      b.post("/customer/recurring-payment-actions", exec, null, 400);
      var a = b.post("/customer/recurring-payment-actions", exec, "http", 200);
      assertThat(b.post("/customer/recurring-payment-actions", exec, "http", 200)).isEqualTo(a);
      assertThat(b.get("/customer/recurring-payment-actions/" + a.path("id").asText(), 200))
          .isEqualTo(a);
      var after = b.get("/customer/recurring-payments/rec_netflix", 200);
      assertThat(after.path("status").asText()).isEqualTo("STOPPED");
      assertThat(after.path("nextExpectedAt").isNull()).isTrue();
      assertThat(after.path("transactionHistory")).hasSize(2);
      assertThat(b.get("/customer/spending/summary", 200)).isEqualTo(before);
      assertThat(
              db.queryForObject(
                  "select count(*) from action_authorizations where status='CONSUMED'", Long.class))
          .isEqualTo(1);
      assertThat(
              db.queryForObject(
                  "select count(*) from security_events where type='AUTHORIZATION_CONSUMED'",
                  Long.class))
          .isEqualTo(1);
    }
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "?customerId=customer_other",
        "?from=2026-09-01",
        "?from=2026-09-01T00:00:00%2B08:00",
        "?accountId=",
        "?accountId=acc_current&accountId=acc_usd",
        "?from=2026-02-30T00:00:00Z&to=2026-03-01T00:00:00Z",
        "?from=2025-01-01T00:00:00Z&to=2026-09-01T00:00:00Z",
        "?from=2026-09-01T00:00:00Z&to=2026-09-01T00:00:00Z"
      })
  void malformedSpendingQueriesRejected(String suffix) throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      assertThat(b.get("/customer/spending/summary" + suffix, 400).path("code").asText())
          .isEqualTo("INVALID_QUERY");
    }
  }

  @Test
  void httpUnknownForeignResourcesAndBodyOverrides() throws Exception {
    try (var a = new Browser();
        var b = new Browser()) {
      a.login("alex@aster.local");
      b.login("other@aster.local");
      assertThat(b.get("/customer/recurring-payments", 200).path("items")).isEmpty();
      b.get("/customer/recurring-payments/rec_netflix", 404);
      a.get("/customer/recurring-payments/unknown", 404);
      a.get("/customer/spending/summary?accountId=acc_other", 404);
      b.get("/customer/spending/summary?accountId=acc_current", 404);
      a.get("/customer/recurring-payments?status=ACTIVE", 400);
      a.get("/customer/recurring-payments?customerId=customer_other", 400);
      for (var body :
          List.of(
              Map.of(
                  "recurringPaymentId",
                  "rec_netflix",
                  "actionType",
                  "STOP_FUTURE_PAYMENTS",
                  "managementCapability",
                  "STOP_FUTURE_PAYMENTS"),
              Map.of("recurringPaymentId", "rec_netflix", "actionType", "RESTART"),
              Map.of("recurringPaymentId", 12, "actionType", "STOP_FUTURE_PAYMENTS")))
        a.post("/customer/recurring-payment-action-intents", body, null, 400);
      assertThat(
              a.post(
                      "/customer/recurring-payment-action-intents",
                      Map.of(
                          "recurringPaymentId",
                          "rec_bookshop",
                          "actionType",
                          "STOP_FUTURE_PAYMENTS"),
                      null,
                      422)
                  .path("code")
                  .asText())
          .isEqualTo("RECURRING_PAYMENT_NOT_MANAGEABLE");
      var i = prepare();
      b.get("/customer/recurring-payment-action-intents/" + i.terms().id(), 404);
      b.post(
          "/customer/recurring-payment-actions",
          Map.of("intentId", i.terms().id(), "intentHash", i.intentHash()),
          "other",
          404);
      a.post(
          "/customer/recurring-payment-actions",
          Map.of(
              "intentId",
              i.terms().id(),
              "intentHash",
              i.intentHash(),
              "nextExpectedAt",
              "changed"),
          "extra",
          400);
      var receipt = execute(i, "action");
      b.get("/customer/recurring-payment-actions/" + receipt.id(), 404);
    }
  }

  @Test
  void immutablePersistenceAndSeedDoNotOverwriteState() {
    var i = prepare();
    var t = i.terms();
    var changed =
        new RecurringIntent.Terms(
            t.id(), t.payment(), t.after(), "Different", t.createdAt(), t.expiresAt());
    failure(
        () ->
            store.write(
                () -> {
                  store.save(new RecurringIntent(changed, i.intentHash(), i.status()));
                  return null;
                }),
        "PERSISTENCE_UNAVAILABLE");
    execute(i, "seed");
    context.getBean(DemoRecurringSeed.class).initialize();
    assertThat(recurring.detail(ALEX, "rec_netflix").status())
        .isEqualTo(RecurringPayment.Status.STOPPED);
    assertThat(
            db.queryForList(
                "select table_name from information_schema.tables where table_schema='public'",
                String.class))
        .doesNotContain("spending_transactions", "spending_totals");
    assertThat(
            db.queryForList(
                "select column_name from information_schema.columns where table_name like 'recurring%'",
                String.class))
        .noneMatch(s -> s.matches("(?i).*(cvv|full_pan|password|secret).*"));
  }

  @Test
  @Order(Integer.MAX_VALUE)
  void entireApplicationRestartPreservesStopReceiptIntentHistoryAndReplay() {
    var i = prepare();
    var a = execute(i, "restart");
    var history = recurring.detail(ALEX, "rec_netflix").transactionHistory();
    context.close();
    open();
    assertThat(recurring.detail(ALEX, "rec_netflix").status())
        .isEqualTo(RecurringPayment.Status.STOPPED);
    assertThat(recurring.detail(ALEX, "rec_netflix").nextExpectedAt()).isNull();
    assertThat(recurring.detail(ALEX, "rec_netflix").transactionHistory()).isEqualTo(history);
    assertThat(recurring.intent(ALEX, i.terms().id()).status())
        .isEqualTo(RecurringIntent.Status.EXECUTED);
    assertThat(execute(i, "restart")).isEqualTo(a);
    assertThat(report().totalSpend()).isEqualByComparingTo("4968");
  }
}
