package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.asterbank.banking.customer.account.adapter.inmemory.InMemoryAccountRepository;
import com.asterbank.banking.customer.payment.adapter.inmemory.*;
import com.asterbank.banking.customer.payment.adapter.web.PaymentMapper;
import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.transaction.adapter.inmemory.InMemoryTransactionRepository;
import com.asterbank.banking.shared.adapter.inmemory.BankingMemoryLock;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.test.web.servlet.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class TransferEndpointsTest {
  static FoundationTestContext runtime;
  static MockMvc mvc;
  UnitVerification verification;
  final Map<String, org.springframework.mock.web.MockHttpSession> sessions = new HashMap<>();

  org.springframework.mock.web.MockHttpSession session(String customer) {
    return sessions.computeIfAbsent(
        customer, k -> new org.springframework.mock.web.MockHttpSession());
  }

  static final String ALEX = "usr_aster_alex", OTHER = "customer_other";
  static InMemoryAccountRepository accounts;
  static InMemoryTransactionRepository transactions;
  static InMemoryAccountRepository.State initialAccounts;
  static InMemoryTransactionRepository.State initialTransactions;
  static final JsonMapper JSON = JsonMapper.builder().build();
  static final String PREPARE =
      """
 {"sourceAccountId":"acc_current","recipientId":"recipient_zhang","amount":{"amount":"500.00","currency":"CNY"},"note":"For dinner"}
 """;

  @BeforeAll
  static void start() {
    runtime =
        new FoundationTestContext(
            new String[] {"test"},
            ReadDomainFixtures.Isolation.class,
            TransferFixtures.HttpConfig.class);
    mvc = runtime.mvc;
    accounts = runtime.context.getBean(InMemoryAccountRepository.class);
    transactions = runtime.context.getBean(InMemoryTransactionRepository.class);
    initialAccounts = accounts.checkpoint();
    initialTransactions = transactions.checkpoint();
  }

  @AfterAll
  static void stop() {
    if (runtime != null) runtime.close();
  }

  @BeforeEach
  void reset() {
    verification = new UnitVerification(runtime.context.getBean(TransferFixtures.TestClock.class));
    runtime
        .context
        .getBean(TransferExecutionService.class)
        .withAuthorizations(verification.service);
    runtime
        .context
        .getBean(BankingMemoryLock.class)
        .write(
            () -> {
              accounts.restore(initialAccounts);
              transactions.restore(initialTransactions);
              runtime.context.getBean(InMemoryTransferIntentRepository.class).restore(Map.of());
              runtime.context.getBean(InMemoryTransferRepository.class).restore(Map.of());
              runtime.context.getBean(InMemoryIdempotencyRepository.class).restore(Map.of());
              runtime.context.getBean(TransferFixtures.TestClock.class).value =
                  Instant.parse("2026-09-27T02:30:00Z");
            });
  }

  @Test
  void recipientsAreScopedAndSearchUsesNameOrBank() throws Exception {
    mvc.perform(get("/customer/recipients").session(session(ALEX)).with(user(ALEX)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items.length()").value(3))
        .andExpect(jsonPath("$.items[0].displayName").value("Zhang San"))
        .andExpect(jsonPath("$.items[0].maskedAccountNumber").value("•••• 6018"));
    mvc.perform(
            get("/customer/recipients")
                .param("search", " ZHANG ")
                .session(session(ALEX))
                .with(user(ALEX)))
        .andExpect(jsonPath("$.items.length()").value(1));
    mvc.perform(
            get("/customer/recipients")
                .param("search", "maple")
                .session(session(ALEX))
                .with(user(ALEX)))
        .andExpect(jsonPath("$.items[0].id").value("recipient_li"));
    mvc.perform(get("/customer/recipients").session(session(OTHER)).with(user(OTHER)))
        .andExpect(jsonPath("$.items.length()").value(1))
        .andExpect(jsonPath("$.items[0].id").value("recipient_other"));
    mvc.perform(
            get("/customer/recipients")
                .param("search", "private")
                .session(session(ALEX))
                .with(user(ALEX)))
        .andExpect(jsonPath("$.items.length()").value(0));
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "/customer/recipients",
        "/customer/transfer-intents/missing",
        "/customer/transfers/missing"
      })
  void anonymousReadsFailClosed(String path) throws Exception {
    mvc.perform(get(path).header("X-Customer-Id", ALEX))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
  }

  @ParameterizedTest
  @ValueSource(strings = {"/customer/transfer-intents", "/customer/transfers"})
  void anonymousPostsFailClosedEvenWithoutCsrf(String path) throws Exception {
    mvc.perform(
            post(path)
                .contentType("application/json")
                .content(PREPARE)
                .header("X-Customer-Id", ALEX))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    mvc.perform(
            post(path)
                .with(csrf().asHeader())
                .with(
                    r -> {
                      r.setSession(session(ALEX));
                      return r;
                    })
                .contentType("application/json")
                .content(PREPARE))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void authenticatedPostsStillRequireValidCsrf() throws Exception {
    mvc.perform(
            post("/customer/transfer-intents")
                .session(session(ALEX))
                .with(user(ALEX))
                .contentType("application/json")
                .content(PREPARE))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/customer/transfers")
                .session(session(ALEX))
                .with(user(ALEX))
                .with(csrf().useInvalidToken())
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isForbidden());
  }

  @Test
  void fullHttpFlowReconcilesAccountIntentReceiptTransactionAndReplay() throws Exception {
    var intent = prepare(PREPARE, ALEX);
    String id = intent.get("id").asString();
    var command = command(intent);
    assertThat(accounts.checkpoint()).isEqualTo(initialAccounts);
    assertThat(transactions.checkpoint()).isEqualTo(initialTransactions);
    assertThat(intent.get("amount").get("amount").isString()).isTrue();
    assertThat(intent.get("fee").get("amount").asString()).isEqualTo("0.00");
    assertThat(intent.get("projectedAvailableBalance").get("amount").asString())
        .isEqualTo("23310.31");
    assertThat(java.time.OffsetDateTime.parse(intent.get("expiresAt").asString()))
        .isEqualTo(
            java.time.OffsetDateTime.parse(intent.get("createdAt").asString()).plusMinutes(15));
    mvc.perform(get("/customer/transfer-intents/" + id).session(session(ALEX)).with(user(ALEX)))
        .andExpect(content().json(intent.toString()));
    var receipt = execute(command, "key", ALEX);
    mvc.perform(get("/customer/accounts/acc_current").session(session(ALEX)).with(user(ALEX)))
        .andExpect(jsonPath("$.balance.amount").value("23342.31"))
        .andExpect(jsonPath("$.availableBalance.amount").value("23310.31"))
        .andExpect(jsonPath("$.pendingAmount.amount").value("32.00"))
        .andExpect(
            jsonPath("$.recentTransactions[0].id").value(receipt.get("transactionId").asString()));
    mvc.perform(get("/customer/transfer-intents/" + id).session(session(ALEX)).with(user(ALEX)))
        .andExpect(jsonPath("$.status").value("EXECUTED"))
        .andExpect(jsonPath("$.sourceAccount.balance.amount").value("23842.31"));
    mvc.perform(
            get("/customer/transfers/" + receipt.get("id").asString())
                .session(session(ALEX))
                .with(user(ALEX)))
        .andExpect(content().json(receipt.toString()));
    mvc.perform(
            get("/customer/transactions")
                .param("search", receipt.get("reference").asString())
                .session(session(ALEX))
                .with(user(ALEX)))
        .andExpect(jsonPath("$.items.length()").value(0));
    mvc.perform(
            get("/customer/transactions/" + receipt.get("transactionId").asString())
                .session(session(ALEX))
                .with(user(ALEX)))
        .andExpect(jsonPath("$.type").value("BANK_TRANSFER"))
        .andExpect(jsonPath("$.category").value("TRANSFER"))
        .andExpect(jsonPath("$.direction").value("DEBIT"))
        .andExpect(jsonPath("$.amount.amount").value("500.00"))
        .andExpect(jsonPath("$.counterparty.name").value("Zhang San"))
        .andExpect(jsonPath("$.merchant").doesNotExist());
    mvc.perform(
            get("/customer/transactions")
                .param("type", "BANK_TRANSFER")
                .param("search", "Zhang San")
                .session(session(ALEX))
                .with(user(ALEX)))
        .andExpect(jsonPath("$.items[0].id").value(receipt.get("transactionId").asString()));
    var before = accounts.checkpoint();
    var tx = transactions.checkpoint();
    assertThat(execute(command, "key", ALEX)).isEqualTo(receipt);
    assertThat(accounts.checkpoint()).isEqualTo(before);
    assertThat(transactions.checkpoint()).isEqualTo(tx);
  }

  @ParameterizedTest
  @CsvSource({
    "acc_missing,recipient_zhang,ACCOUNT_NOT_FOUND",
    "acc_other,recipient_zhang,ACCOUNT_NOT_FOUND",
    "acc_current,recipient_missing,RECIPIENT_NOT_FOUND",
    "acc_current,recipient_other,RECIPIENT_NOT_FOUND"
  })
  void foreignAndMissingPreparationResourcesUseFrozen404(
      String account, String recipient, String code) throws Exception {
    errorPrepare(
        PREPARE.replace("acc_current", account).replace("recipient_zhang", recipient), 404, code);
  }

  @ParameterizedTest
  @ValueSource(strings = {"0.00", "-1.00", "1.001", "1", "01.00", "1000000000000.00"})
  void invalidAmountsHaveFrozen422(String amount) throws Exception {
    errorPrepare(PREPARE.replace("500.00", amount), 422, "INVALID_AMOUNT");
  }

  @Test
  void unsupportedCurrencyAndInsufficientFunds() throws Exception {
    errorPrepare(PREPARE.replace("CNY", "USD"), 422, "CURRENCY_MISMATCH");
    errorPrepare(PREPARE.replace("500.00", "23811.00"), 422, "INSUFFICIENT_FUNDS");
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "{}",
        "null",
        "[]",
        "{\"sourceAccountId\":\"acc_current\",\"recipientId\":\"recipient_zhang\",\"amount\":500}",
        "{\"sourceAccountId\":\"acc_current\",\"recipientId\":\"recipient_zhang\",\"amount\":{\"amount\":500,\"currency\":\"CNY\"}}",
        "{\"sourceAccountId\":\"acc_current\",\"recipientId\":\"recipient_zhang\",\"amount\":{\"amount\":\"500.00\",\"currency\":\"CNY\",\"fee\":\"0.00\"}}"
      })
  void malformedBodyUsesApiError(String body) throws Exception {
    errorPrepare(body, 400, "INVALID_REQUEST");
  }

  @Test
  void extraFieldsCannotOverrideBusinessTermsAndMissingKeyFails() throws Exception {
    errorPrepare(
        PREPARE
            .strip()
            .replace(
                "\"note\":\"For dinner\"",
                "\"note\":\"For dinner\",\"customerId\":\"customer_other\""),
        400,
        "INVALID_REQUEST");
    var i = prepare(PREPARE, ALEX);
    var body = command(i);
    mvc.perform(
            post("/customer/transfers")
                .session(session(ALEX))
                .with(user(ALEX))
                .with(csrf().asHeader())
                .with(
                    r -> {
                      r.setSession(session(ALEX));
                      return r;
                    })
                .contentType("application/json")
                .content(body))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    mvc.perform(
            post("/customer/transfers")
                .session(session(ALEX))
                .with(user(ALEX))
                .with(csrf().asHeader())
                .with(
                    r -> {
                      r.setSession(session(ALEX));
                      return r;
                    })
                .header("Idempotency-Key", "bad key")
                .contentType("application/json")
                .content(body))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    errorExecute(
        body.substring(0, body.length() - 1) + ",\"amount\":\"1.00\"}",
        "key",
        400,
        "INVALID_REQUEST",
        ALEX);
    assertThat(accounts.checkpoint()).isEqualTo(initialAccounts);
  }

  @Test
  void lifecycleConflictsUseFrozenErrorsAndUnsuccessfulKeysAreReusable() throws Exception {
    var i = prepare(PREPARE, ALEX);
    var body = command(i);
    errorExecute(
        body.replace(i.get("intentHash").asString(), "bad"),
        "key",
        409,
        "TRANSFER_INTENT_HASH_MISMATCH",
        ALEX);
    execute(body, "key", ALEX);
    errorExecute(body, "different", 409, "TRANSFER_INTENT_ALREADY_EXECUTED", ALEX);
    var other = prepare(PREPARE, ALEX);
    errorExecute(command(other), "key", 409, "IDEMPOTENCY_KEY_REUSED", ALEX);
  }

  @Test
  void cancelRequiresCsrfAndOwnerSessionAndIsIdempotent() throws Exception {
    var intent = prepare(PREPARE, ALEX);
    String path = "/customer/transfer-intents/" + intent.get("id").asString() + "/cancel";
    String body = "{\"reason\":\"TASK_REVISED\"}";
    mvc.perform(
            post(path)
                .session(session(ALEX))
                .with(user(ALEX))
                .contentType("application/json")
                .content(body))
        .andExpect(status().isForbidden());
    mvc.perform(
            post(path)
                .session(session(OTHER))
                .with(user(OTHER))
                .with(csrf().asHeader())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("TRANSFER_INTENT_NOT_FOUND"));
    mvc.perform(
            post(path)
                .session(new org.springframework.mock.web.MockHttpSession())
                .with(user(ALEX))
                .with(csrf().asHeader())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("TRANSFER_SESSION_MISMATCH"));
    for (int n = 0; n < 2; n++)
      mvc.perform(
              post(path)
                  .session(session(ALEX))
                  .with(user(ALEX))
                  .with(csrf().asHeader())
                  .contentType("application/json")
                  .content(body))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("CANCELLED"))
          .andExpect(jsonPath("$.intentHash").value(intent.get("intentHash").asString()));
    errorExecute(command(intent), "after_cancel", 409, "TRANSFER_INTENT_CANCELLED", ALEX);
    assertThat(accounts.checkpoint()).isEqualTo(initialAccounts);
  }

  @Test
  void cancelExecutedConflictsAndExpiredRemainsExpired() throws Exception {
    var executed = prepare(PREPARE, ALEX);
    execute(command(executed), "complete", ALEX);
    mvc.perform(
            post("/customer/transfer-intents/" + executed.get("id").asString() + "/cancel")
                .session(session(ALEX))
                .with(user(ALEX))
                .with(csrf().asHeader())
                .contentType("application/json")
                .content("{\"reason\":\"USER_CANCELLED\"}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("TRANSFER_INTENT_ALREADY_EXECUTED"));
    var expired = prepare(PREPARE, ALEX);
    runtime.context.getBean(TransferFixtures.TestClock.class).value =
        java.time.OffsetDateTime.parse(expired.get("expiresAt").asString()).toInstant();
    mvc.perform(
            post("/customer/transfer-intents/" + expired.get("id").asString() + "/cancel")
                .session(session(ALEX))
                .with(user(ALEX))
                .with(csrf().asHeader())
                .contentType("application/json")
                .content("{\"reason\":\"USER_CANCELLED\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("EXPIRED"));
  }

  @Test
  void intentExpiresExactlyAtBoundaryAndGetDerivesStatus() throws Exception {
    var i = prepare(PREPARE, ALEX);
    runtime.context.getBean(TransferFixtures.TestClock.class).value =
        java.time.OffsetDateTime.parse(i.get("expiresAt").asString()).toInstant();
    mvc.perform(
            get("/customer/transfer-intents/" + i.get("id").asString())
                .session(session(ALEX))
                .with(user(ALEX)))
        .andExpect(jsonPath("$.status").value("EXPIRED"));
    errorExecute(command(i), "key", 409, "TRANSFER_INTENT_EXPIRED", ALEX);
    assertThat(accounts.checkpoint()).isEqualTo(initialAccounts);
  }

  @Test
  void crossCustomerIntentAndReceiptAreHiddenBothDirections() throws Exception {
    var i = prepare(PREPARE, ALEX);
    String path = "/customer/transfer-intents/" + i.get("id").asString();
    mvc.perform(get(path).session(session(OTHER)).with(user(OTHER)))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("TRANSFER_INTENT_NOT_FOUND"));
    errorExecute(command(i), "key", 404, "TRANSFER_INTENT_NOT_FOUND", OTHER);
    var receipt = execute(command(i), "key", ALEX);
    mvc.perform(
            get("/customer/transfers/" + receipt.get("id").asString())
                .session(session(OTHER))
                .with(user(OTHER)))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("TRANSFER_NOT_FOUND"));
    var other =
        prepare(
            PREPARE
                .replace("acc_current", "acc_other")
                .replace("recipient_zhang", "recipient_other"),
            OTHER);
    var r = execute(command(other), "key", OTHER);
    mvc.perform(
            get("/customer/transfers/" + r.get("id").asString())
                .session(session(ALEX))
                .with(user(ALEX)))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("TRANSFER_NOT_FOUND"));
  }

  @Test
  void unknownResourcesAndSearchValidation() throws Exception {
    mvc.perform(get("/customer/transfer-intents/missing").session(session(ALEX)).with(user(ALEX)))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("TRANSFER_INTENT_NOT_FOUND"));
    mvc.perform(get("/customer/transfers/missing").session(session(ALEX)).with(user(ALEX)))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("TRANSFER_NOT_FOUND"));
    mvc.perform(
            get("/customer/recipients")
                .param("search", "x".repeat(101))
                .session(session(ALEX))
                .with(user(ALEX)))
        .andExpect(status().isBadRequest());
  }

  @Test
  void customerSelectorAndDuplicateSearchAreRejected() throws Exception {
    mvc.perform(
            get("/customer/recipients")
                .session(session(ALEX))
                .with(user(ALEX))
                .param("customerId", OTHER))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("INVALID_QUERY"));
    mvc.perform(
            get("/customer/recipients")
                .session(session(ALEX))
                .with(user(ALEX))
                .param("search", "Zhang", "Mom"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("INVALID_QUERY"));
  }

  @Test
  void noteLengthAndWireFieldOrderAreValidatedWithoutAffectingSemantics() throws Exception {
    errorPrepare(PREPARE.replace("For dinner", "x".repeat(141)), 400, "INVALID_REQUEST");
    var intent =
        prepare(
            "{\"note\":\"  For dinner  \",\"amount\":{\"currency\":\"CNY\",\"amount\":\"500.00\"},\"recipientId\":\"recipient_zhang\",\"sourceAccountId\":\"acc_current\"}",
            ALEX);
    assertThat(intent.get("note").asString()).isEqualTo("For dinner");
    assertThat(intent.get("amount").get("amount").asString()).isEqualTo("500.00");
  }

  @Test
  void generatedDtoMutationCannotChangeSavedReview() throws Exception {
    var i = prepare(PREPARE, ALEX);
    var service = runtime.context.getBean(TransferPreparationService.class);
    var saved = service.get(new CustomerId(ALEX), i.get("id").asString());
    var dto = PaymentMapper.intent(saved);
    dto.getAmount().setAmount("1.00");
    dto.getRecipient().setDisplayName("Tampered");
    dto.getSourceAccount().getBalance().setAmount("0.00");
    assertThat(service.get(new CustomerId(ALEX), i.get("id").asString())).isEqualTo(saved);
    assertThat(saved.terms().amount().decimal()).isEqualTo("500.00");
  }

  JsonNode prepare(String body, String customer) throws Exception {
    var result =
        mvc.perform(
                post("/customer/transfer-intents")
                    .session(session(customer))
                    .with(user(customer))
                    .with(csrf().asHeader())
                    .with(
                        r -> {
                          r.setSession(session(customer));
                          return r;
                        })
                    .contentType("application/json")
                    .content(body))
            .andExpect(status().isCreated())
            .andExpect(content().contentTypeCompatibleWith("application/json"));
    sessions.put(
        customer,
        (org.springframework.mock.web.MockHttpSession)
            result.andReturn().getRequest().getSession());
    return json(result);
  }

  String command(JsonNode i) {
    return "{\"intentId\":\""
        + i.get("id").asString()
        + "\",\"intentHash\":\""
        + i.get("intentHash").asString()
        + "\"}";
  }

  String verified(String body, String customer) {
    var node = JSON.readTree(body);
    var id = node.path("intentId").asText();
    var intent =
        runtime
            .context
            .getBean(InMemoryTransferIntentRepository.class)
            .find(new CustomerId(customer), id);
    if (intent.isPresent() && !node.has("actionAuthorizationId"))
      ((tools.jackson.databind.node.ObjectNode) node)
          .put(
              "actionAuthorizationId",
              verification.authorize(
                  customer, session(customer).getId(), id, intent.get().intentHash()));
    return JSON.writeValueAsString(node);
  }

  JsonNode execute(String body, String key, String customer) throws Exception {
    body = verified(body, customer);
    return json(
        mvc.perform(
                post("/customer/transfers")
                    .session(session(customer))
                    .with(user(customer))
                    .with(csrf().asHeader())
                    .with(
                        r -> {
                          r.setSession(session(customer));
                          return r;
                        })
                    .header("Idempotency-Key", key)
                    .contentType("application/json")
                    .content(body))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("application/json")));
  }

  JsonNode json(ResultActions result) throws Exception {
    return JSON.readTree(result.andReturn().getResponse().getContentAsString());
  }

  void errorPrepare(String body, int status, String code) throws Exception {
    mvc.perform(
            post("/customer/transfer-intents")
                .session(session(ALEX))
                .with(user(ALEX))
                .with(csrf().asHeader())
                .with(
                    r -> {
                      r.setSession(session(ALEX));
                      return r;
                    })
                .contentType("application/json")
                .content(body))
        .andExpect(status().is(status))
        .andExpect(jsonPath("$.code").value(code));
    assertThat(accounts.checkpoint()).isEqualTo(initialAccounts);
    assertThat(transactions.checkpoint()).isEqualTo(initialTransactions);
  }

  void errorExecute(String body, String key, int status, String code, String customer)
      throws Exception {
    body = verified(body, customer);
    mvc.perform(
            post("/customer/transfers")
                .session(session(customer))
                .with(user(customer))
                .with(csrf().asHeader())
                .with(
                    r -> {
                      r.setSession(session(customer));
                      return r;
                    })
                .header("Idempotency-Key", key)
                .contentType("application/json")
                .content(body))
        .andExpect(status().is(status))
        .andExpect(jsonPath("$.code").value(code));
  }
}
