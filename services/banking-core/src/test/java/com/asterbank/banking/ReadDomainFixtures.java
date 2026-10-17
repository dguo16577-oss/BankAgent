package com.asterbank.banking;

import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.customer.transaction.domain.*;
import com.asterbank.banking.shared.config.DemoSeed;
import com.asterbank.banking.shared.domain.*;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

final class ReadDomainFixtures {
  static final CustomerId ALEX = new CustomerId("usr_aster_alex"),
      OTHER = new CustomerId("customer_other");

  static DemoSeed alex() throws java.io.IOException {
    return DemoSeed.load(JsonMapper.builder().build());
  }

  static DemoSeed withOther(ObjectMapper mapper) throws java.io.IOException {
    var seed = DemoSeed.load(mapper);
    var accounts = new ArrayList<>(seed.accounts());
    var transactions = new ArrayList<>(seed.transactions());
    var other =
        new Account(
            new AccountId("acc_other"),
            OTHER,
            "Other private account",
            AccountType.CURRENT,
            AccountStatus.ACTIVE,
            Money.of("900.00", "CNY"),
            Money.of("0.00", "CNY"),
            "•••• 9900",
            seed.asOf(),
            null);
    accounts.add(other);
    transactions.add(
        new Transaction(
            new TransactionId("txn_other"),
            OTHER,
            other.id(),
            "Other private purchase",
            Money.of("50.00", "CNY"),
            TransactionDirection.DEBIT,
            TransactionStatus.COMPLETED,
            TransactionType.CARD_PAYMENT,
            TransactionCategory.DINING,
            OffsetDateTime.parse("2026-09-27T09:15:00+08:00"),
            seed.asOf(),
            new Merchant("merchant_other", "Other private merchant", null, "•••• 9900"),
            null,
            new CardId("card_other"),
            "••9900",
            null));
    return new DemoSeed(accounts, transactions, seed.asOf());
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class Isolation {
    @Bean
    @Primary
    DemoSeed isolationSeed(ObjectMapper mapper) throws java.io.IOException {
      return withOther(mapper);
    }
  }
}
