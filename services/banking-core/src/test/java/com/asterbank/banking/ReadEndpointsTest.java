package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class ReadEndpointsTest {
  @Test
  void blankResourceIdsReturnNotFoundInsteadOfInternalErrors() throws Exception {
    mvc.perform(get("/customer/accounts/{id}", " ").with(user(ALEX)))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("ACCOUNT_NOT_FOUND"));
    mvc.perform(get("/customer/transactions/{id}", " ").with(user(ALEX)))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("TRANSACTION_NOT_FOUND"));
  }

  static FoundationTestContext runtime;
  static MockMvc mvc;
  static final String ALEX = "usr_aster_alex", OTHER = "customer_other";

  @BeforeAll
  static void start() {
    runtime = new FoundationTestContext(new String[] {"test"}, ReadDomainFixtures.Isolation.class);
    mvc = runtime.mvc;
  }

  @AfterAll
  static void stop() {
    if (runtime != null) runtime.close();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "/customer/accounts",
        "/customer/accounts/acc_current",
        "/customer/transactions",
        "/customer/transactions/txn_coffee"
      })
  void anonymousRequestsStayClosed(String path) throws Exception {
    mvc.perform(get(path).header("X-Customer-Id", ALEX))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
  }

  @Test
  void alexAccountsHaveFrozenShapeExactBalancesAndConversion() throws Exception {
    mvc.perform(get("/customer/accounts").with(user(ALEX)))
        .andExpect(status().isOk())
        .andExpect(content().contentTypeCompatibleWith("application/json"))
        .andExpect(jsonPath("$.accounts.length()").value(3))
        .andExpect(jsonPath("$.baseCurrency").value("CNY"))
        .andExpect(jsonPath("$.asOf").value("2026-09-27T10:30:00+08:00"))
        .andExpect(jsonPath("$.totalBalance.amount").isString())
        .andExpect(jsonPath("$.totalBalance.amount").value("36453.68"))
        .andExpect(jsonPath("$.accounts[0].id").value("acc_current"))
        .andExpect(jsonPath("$.accounts[0].balance.amount").value("23842.31"))
        .andExpect(jsonPath("$.accounts[0].pendingAmount.amount").value("32.00"))
        .andExpect(jsonPath("$.accounts[0].availableBalance.amount").value("23810.31"))
        .andExpect(jsonPath("$.accounts[0].maskedAccountNumber").value("•••• 1048"))
        .andExpect(jsonPath("$.accounts[0].type").value("CURRENT"))
        .andExpect(jsonPath("$.accounts[0].status").value("ACTIVE"))
        .andExpect(jsonPath("$.accounts[2].balance.currency").value("USD"))
        .andExpect(jsonPath("$.accounts[2].balance.amount").value("621.32"))
        .andExpect(jsonPath("$.accounts[2].baseCurrencyEquivalent.value.amount").value("4411.37"))
        .andExpect(jsonPath("$.exchangeEquivalents[0].exchangeRate").value("7.10"))
        .andExpect(jsonPath("$.exchangeEquivalents[0].conversionSource").value("DEMO_RATE"))
        .andExpect(
            jsonPath("$.exchangeEquivalents[0].conversionAsOf").value("2026-09-27T10:00:00+08:00"));
  }

  @Test
  void accountDetailRetainsFiveRecentTransactionsAndOriginalMetadata() throws Exception {
    mvc.perform(get("/customer/accounts/acc_current").with(user(ALEX)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.recentTransactions.length()").value(5))
        .andExpect(jsonPath("$.recentTransactions[0].id").value("txn_coffee"))
        .andExpect(jsonPath("$.recentTransactions[0].amount.amount").value("32.00"))
        .andExpect(jsonPath("$.openedAt").value("2022-03-15T09:00:00+08:00"));
  }

  @ParameterizedTest
  @CsvSource({
    "acc_missing,ACCOUNT_NOT_FOUND,accounts",
    "acc_other,ACCOUNT_NOT_FOUND,accounts",
    "txn_missing,TRANSACTION_NOT_FOUND,transactions",
    "txn_other,TRANSACTION_NOT_FOUND,transactions"
  })
  void inaccessibleAndUnknownResourcesHaveSameNotFound(String id, String code, String area)
      throws Exception {
    mvc.perform(get("/customer/" + area + "/" + id).with(user(ALEX)))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value(code))
        .andExpect(jsonPath("$.message").isString());
  }

  @Test
  void otherCustomerCannotEnumerateAlexEvenWithForgedParameters() throws Exception {
    mvc.perform(get("/customer/transactions").with(user(OTHER)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items.length()").value(1))
        .andExpect(jsonPath("$.items[0].id").value("txn_other"));
    mvc.perform(get("/customer/accounts").with(user(OTHER)))
        .andExpect(jsonPath("$.accounts.length()").value(1))
        .andExpect(jsonPath("$.accounts[0].id").value("acc_other"));
    mvc.perform(get("/customer/accounts/acc_current").with(user(OTHER)))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("ACCOUNT_NOT_FOUND"));
    mvc.perform(get("/customer/transactions/txn_coffee").with(user(OTHER)))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("TRANSACTION_NOT_FOUND"));
    for (String[] filter :
        new String[][] {
          {ALEX, "accountId", "acc_other"},
          {ALEX, "cardId", "card_other"},
          {OTHER, "accountId", "acc_current"},
          {OTHER, "cardId", "card_aster_debit"}
        })
      mvc.perform(get("/customer/transactions").with(user(filter[0])).param(filter[1], filter[2]))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.items").isEmpty());
    mvc.perform(get("/customer/transactions").with(user(ALEX)).param("customerId", OTHER))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("INVALID_QUERY"));
  }

  @Test
  void transactionDetailDistinguishesMerchantCounterpartyAndPendingNull() throws Exception {
    mvc.perform(get("/customer/transactions/txn_coffee").with(user(ALEX)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.amount.amount").isString())
        .andExpect(jsonPath("$.amount.amount").value("32.00"))
        .andExpect(jsonPath("$.direction").value("DEBIT"))
        .andExpect(jsonPath("$.status").value("PENDING"))
        .andExpect(jsonPath("$.bookedAt").value(org.hamcrest.Matchers.nullValue()))
        .andExpect(jsonPath("$.merchant.name").value("Starbucks"))
        .andExpect(jsonPath("$.counterparty").doesNotExist())
        .andExpect(jsonPath("$.cardId").value("card_aster_debit"))
        .andExpect(jsonPath("$.cardMaskedNumber").value("••8821"))
        .andExpect(jsonPath("$.reference").value("ASTER-txn_coffee"))
        .andExpect(jsonPath("$.account.id").value("acc_current"));
    mvc.perform(get("/customer/transactions/txn_history_0_07").with(user(ALEX)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.direction").value("CREDIT"))
        .andExpect(jsonPath("$.counterparty.name").value("Jamie Lee"))
        .andExpect(jsonPath("$.counterparty.maskedAccountNumber").value("•••• 6702"))
        .andExpect(jsonPath("$.merchant").doesNotExist());
  }

  @ParameterizedTest
  @CsvSource({
    "accountId,acc_usd,accountId,acc_usd",
    "cardId,card_aster_debit,cardId,card_aster_debit",
    "status,PENDING,status,PENDING",
    "direction,CREDIT,direction,CREDIT",
    "type,BANK_TRANSFER,type,BANK_TRANSFER",
    "category,DINING,category,DINING"
  })
  void eachFilterRunsAcrossTheRepository(String name, String value, String field, String expected)
      throws Exception {
    JsonNode page = query(Map.of(name, value, "limit", "50"));
    assertThat(page.get("items").size()).isPositive();
    for (JsonNode item : page.get("items"))
      assertThat(item.get(field).asString()).isEqualTo(expected);
  }

  @Test
  void dateRangeIsInclusiveExclusiveAndComparedAsInstants() throws Exception {
    JsonNode page = query(Map.of("from", "2026-09-26T00:10:00Z", "to", "2026-09-26T10:42:00Z"));
    assertThat(ids(page)).containsExactly("txn_metro");
  }

  @ParameterizedTest
  @CsvSource({
    "STARBUCKS,txn_coffee",
    "jamie,txn_history_0_07",
    "monthly salary,txn_salary",
    "aster-txn_coffee,NONE"
  })
  void deterministicSearchUsesOnlyFrozenFields(String term, String expected) throws Exception {
    JsonNode page = query(Map.of("search", "  " + term + "  ", "limit", "50"));
    if (expected.equals("NONE")) assertThat(ids(page)).isEmpty();
    else assertThat(ids(page)).contains(expected);
  }

  @Test
  void combinedFilterAndEmptyResult() throws Exception {
    assertThat(
            ids(
                query(
                    Map.of(
                        "accountId",
                        "acc_current",
                        "cardId",
                        "card_aster_debit",
                        "status",
                        "PENDING",
                        "category",
                        "DINING",
                        "search",
                        "STARBUCKS"))))
        .containsExactly("txn_coffee");
    JsonNode empty = query(Map.of("status", "PENDING", "direction", "CREDIT"));
    assertThat(ids(empty)).isEmpty();
    assertThat(empty.get("hasMore").asBoolean()).isFalse();
    assertThat(empty.get("nextCursor").isNull()).isTrue();
  }

  @Test
  void defaultAndCursorPagesTraverseEveryAlexRecordWithoutDuplicates() throws Exception {
    var first = query(Map.of());
    assertThat(first.get("items").size()).isEqualTo(10);
    assertThat(ids(first).getFirst()).isEqualTo("txn_coffee");
    List<String> ids = new ArrayList<>(ids(first));
    JsonNode page = first;
    while (page.get("hasMore").asBoolean()) {
      page = query(Map.of("cursor", page.get("nextCursor").asString()));
      ids.addAll(ids(page));
      assertThat(ids.size()).isLessThanOrEqualTo(61);
    }
    var expected =
        ReadDomainFixtures.alex().transactions().stream()
            .sorted(com.asterbank.banking.customer.transaction.domain.Transaction.ORDER)
            .map(t -> t.id().value())
            .toList();
    assertThat(ids).doesNotHaveDuplicates().containsExactlyElementsOf(expected);
  }

  @ParameterizedTest
  @CsvSource({
    "limit,0",
    "limit,51",
    "limit,-1",
    "limit,1.5",
    "limit,abc",
    "limit,9999999999999999999999",
    "status,UNKNOWN",
    "direction,debit",
    "type,BOGUS",
    "category,BOGUS",
    "from,2026-02-30T00:00:00Z",
    "from,2026-09-01T00:00:00",
    "page,2"
  })
  void invalidQueriesNeverBecome500(String key, String value) throws Exception {
    mvc.perform(get("/customer/transactions").with(user(ALEX)).param(key, value))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("INVALID_QUERY"));
  }

  @Test
  void duplicatesSearchLengthReversedDatesAndBadCursorsRejectSafely() throws Exception {
    for (var request :
        List.of(
            get("/customer/transactions").param("limit", "1", "2"),
            get("/customer/transactions").param("limit", ""),
            get("/customer/transactions").param("search", "x".repeat(101)),
            get("/customer/transactions")
                .param("from", "2026-09-02T00:00:00Z")
                .param("to", "2026-09-01T00:00:00Z")))
      mvc.perform(request.with(user(ALEX)))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("INVALID_QUERY"));
    for (String cursor : List.of("%%%", "e30", "a", "x".repeat(2049)))
      mvc.perform(get("/customer/transactions").with(user(ALEX)).param("cursor", cursor))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("INVALID_CURSOR"));
  }

  @Test
  void transferCancellationJoinsCustomerOperationsAndPublicStillAbsent() throws Exception {
    var mapping =
        runtime.context.getBean("requestMappingHandlerMapping", RequestMappingHandlerMapping.class);
    var paths =
        mapping.getHandlerMethods().entrySet().stream()
            .filter(e -> e.getValue().getBeanType().getName().contains(".adapter.web."))
            .flatMap(e -> e.getKey().getPatternValues().stream())
            .toList();
    assertThat(paths)
        .containsExactlyInAnyOrder(
            "/customer/accounts",
            "/customer/accounts/{accountId}",
            "/customer/transactions",
            "/customer/transactions/{transactionId}",
            "/customer/recipients",
            "/customer/transfer-intents",
            "/customer/transfer-intents/{intentId}",
            "/customer/transfer-intents/{intentId}/cancel",
            "/customer/transfers",
            "/customer/transfers/{transferId}");
    mvc.perform(get("/public/home")).andExpect(status().isNotFound());
    mvc.perform(get("/customer/overview").with(user(ALEX))).andExpect(status().isNotFound());
  }

  JsonNode query(Map<String, String> params) throws Exception {
    var request = get("/customer/transactions").with(user(ALEX));
    params.forEach(request::param);
    String body =
        mvc.perform(request)
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("application/json"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(body)
        .doesNotContain("password", "securityCode", "cvv", "accountNumber\"", "cardNumber\"");
    return JsonMapper.builder().build().readTree(body);
  }

  static List<String> ids(JsonNode page) {
    List<String> ids = new ArrayList<>();
    page.get("items").forEach(item -> ids.add(item.get("id").asString()));
    return ids;
  }
}
