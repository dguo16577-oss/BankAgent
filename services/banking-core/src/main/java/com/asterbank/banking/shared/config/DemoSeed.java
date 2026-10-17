package com.asterbank.banking.shared.config;

import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.customer.transaction.domain.*;
import com.asterbank.banking.shared.domain.*;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Backend-owned immutable seed resource. No TypeScript or HTTP DTO dependency. */
public record DemoSeed(
    List<Account> accounts, List<Transaction> transactions, OffsetDateTime asOf) {
  public DemoSeed {
    accounts = List.copyOf(accounts);
    transactions = List.copyOf(transactions);
  }

  public static DemoSeed empty(Clock clock) {
    return new DemoSeed(List.of(), List.of(), OffsetDateTime.now(clock));
  }

  public static DemoSeed load(ObjectMapper mapper) throws java.io.IOException {
    try (var input = new ClassPathResource("demo/alex-initial.json").getInputStream()) {
      JsonNode root = mapper.readTree(input);
      CustomerId customer = new CustomerId(root.get("customerId").asString());
      List<Account> accounts = new ArrayList<>();
      List<Transaction> transactions = new ArrayList<>();
      for (JsonNode a : root.get("accounts")) {
        JsonNode e = a.get("baseCurrencyEquivalent");
        var equivalent =
            e == null
                ? null
                : new ExchangeEquivalent(
                    money(e.get("value")),
                    Currency.getInstance(text(e, "sourceCurrency")),
                    new BigDecimal(text(e, "exchangeRate")),
                    time(e, "conversionAsOf"));
        var account =
            new Account(
                new AccountId(text(a, "id")),
                customer,
                text(a, "displayName"),
                AccountType.valueOf(text(a, "type")),
                AccountStatus.valueOf(text(a, "status")),
                money(a.get("balance")),
                money(a.get("pendingAmount")),
                text(a, "maskedAccountNumber"),
                time(a, "openedAt"),
                equivalent);
        if (!account.availableBalance().equals(money(a.get("availableBalance"))))
          throw new IllegalStateException("Seed account invariant mismatch");
        accounts.add(account);
      }
      for (JsonNode t : root.get("transactions")) {
        JsonNode m = t.get("merchant"), c = t.get("counterparty");
        String card = text(t, "cardId");
        transactions.add(
            new Transaction(
                new TransactionId(text(t, "id")),
                customer,
                new AccountId(text(t, "accountId")),
                text(t, "title"),
                money(t.get("amount")),
                TransactionDirection.valueOf(text(t, "direction")),
                TransactionStatus.valueOf(text(t, "status")),
                TransactionType.valueOf(text(t, "type")),
                TransactionCategory.valueOf(text(t, "category")),
                time(t, "occurredAt"),
                time(t, "bookedAt"),
                m == null
                    ? null
                    : new Merchant(
                        text(m, "id"),
                        text(m, "name"),
                        text(m, "location"),
                        text(m, "maskedCardNumber")),
                c == null
                    ? null
                    : new Counterparty(text(c, "name"), text(c, "maskedAccountNumber")),
                card == null ? null : new CardId(card),
                text(t, "cardMaskedNumber"),
                text(t, "reference")));
      }
      return new DemoSeed(accounts, transactions, time(root, "asOf"));
    }
  }

  private static String text(JsonNode n, String field) {
    JsonNode value = n.get(field);
    return value == null || value.isNull() ? null : value.asString();
  }

  private static OffsetDateTime time(JsonNode n, String field) {
    String value = text(n, field);
    return value == null ? null : OffsetDateTime.parse(value);
  }

  private static Money money(JsonNode n) {
    return Money.of(text(n, "amount"), text(n, "currency"));
  }
}
