package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;

import com.asterbank.banking.customer.account.adapter.inmemory.InMemoryAccountRepository;
import com.asterbank.banking.customer.account.application.*;
import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.customer.transaction.adapter.inmemory.InMemoryTransactionRepository;
import com.asterbank.banking.customer.transaction.application.*;
import com.asterbank.banking.customer.transaction.domain.*;
import com.asterbank.banking.shared.config.DemoSeed;
import com.asterbank.banking.shared.domain.*;
import com.asterbank.banking.shared.web.ReadModelMapper;
import java.io.*;
import java.math.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ReadDomainTest {
  @Test
  void searchFindsMerchantAndCounterpartyEvenWhenTitleDiffersButNeverReference() {
    var merchant =
        sample(
            "Neutral title",
            new Merchant("m", "Merchant Only", null, "•••• 8821"),
            null,
            Money.of("1.00", "CNY"));
    var counterparty =
        sample(
            "Another title",
            null,
            new Counterparty("Counterparty Only", "•••• 6702"),
            Money.of("1.00", "CNY"));
    assertThat(
            filter(null, null, null, null, null, null, null, null, " merchant ONLY ", 10)
                .matches(merchant))
        .isTrue();
    assertThat(
            filter(null, null, null, null, null, null, null, null, "COUNTERPARTY only", 10)
                .matches(counterparty))
        .isTrue();
    assertThat(
            filter(null, null, null, null, null, null, null, null, "REFERENCE-ONLY", 10)
                .matches(merchant))
        .isFalse();
    assertThatThrownBy(() -> sample("Negative", null, null, Money.of("-1.00", "CNY")))
        .isInstanceOf(IllegalArgumentException.class);
  }

  private Transaction sample(
      String title, Merchant merchant, Counterparty counterparty, Money amount) {
    return new Transaction(
        new TransactionId("txn_sample"),
        ReadDomainFixtures.ALEX,
        new AccountId("acc_current"),
        title,
        amount,
        TransactionDirection.DEBIT,
        TransactionStatus.COMPLETED,
        counterparty == null ? TransactionType.CARD_PAYMENT : TransactionType.BANK_TRANSFER,
        TransactionCategory.OTHER,
        OffsetDateTime.parse("2026-09-27T10:30:00+08:00"),
        OffsetDateTime.parse("2026-09-27T10:30:00+08:00"),
        merchant,
        counterparty,
        null,
        null,
        "REFERENCE-ONLY");
  }

  @Test
  void seedUsesMaskedIdentifiersAndMappedDtoCannotMutateDomain() {
    for (var account : seed.accounts())
      assertThat(account.maskedAccountNumber()).matches("•••• [0-9]{4}");
    for (var t : seed.transactions()) {
      if (t.cardMaskedNumber() != null) assertThat(t.cardMaskedNumber()).matches("••[0-9]{4}");
      if (t.merchant() != null && t.merchant().maskedCardNumber() != null)
        assertThat(t.merchant().maskedCardNumber()).matches("•••• [0-9]{4}");
      if (t.counterparty() != null)
        assertThat(t.counterparty().maskedAccountNumber()).matches("•••• [0-9]{4}");
    }
    var account = seed.accounts().getFirst();
    var response = ReadModelMapper.account(account);
    response.getBalance().setAmount("0.00");
    assertThat(account.balance().decimal()).isEqualTo("23842.31");
  }

  DemoSeed seed;
  InMemoryAccountRepository accounts;
  InMemoryTransactionRepository repository;
  TransactionQueryService transactions;
  AccountQueryService accountQueries;

  @BeforeEach
  void setup() throws Exception {
    seed = ReadDomainFixtures.alex();
    accounts = new InMemoryAccountRepository(seed.accounts(), seed.asOf());
    repository = new InMemoryTransactionRepository(seed.transactions(), "test-snapshot");
    transactions = new TransactionQueryService(repository, accounts::find, new CursorCodec());
    accountQueries = new AccountQueryService(accounts, transactions);
  }

  @Test
  void moneyIsExactAndNeverScientific() {
    assertThat(Money.of("0.10", "CNY").add(Money.of("0.20", "CNY")).decimal()).isEqualTo("0.30");
    assertThat(Money.of("123456789012345678901234567890.12", "CNY").decimal())
        .isEqualTo("123456789012345678901234567890.12");
    assertThat(Money.of("1E+20", "CNY").decimal()).isEqualTo("100000000000000000000.00");
    assertThatThrownBy(() -> Money.of("1.001", "CNY")).isInstanceOf(ArithmeticException.class);
    assertThatThrownBy(() -> Money.of("1.00", "CNY").add(Money.of("1.00", "USD")))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void accountsPendingAndFxReconcileWithAllInitialTransactions() {
    assertThat(seed.accounts()).hasSize(3);
    assertThat(seed.transactions()).hasSize(61);
    for (var a : seed.accounts()) {
      var pending =
          seed.transactions().stream()
              .filter(
                  t ->
                      t.accountId().equals(a.id())
                          && t.status() == TransactionStatus.PENDING
                          && t.direction() == TransactionDirection.DEBIT)
              .map(Transaction::amount)
              .reduce(Money.of("0.00", a.balance().currency().getCurrencyCode()), Money::add);
      assertThat(a.pendingAmount()).isEqualTo(pending);
      assertThat(a.balance().subtract(pending)).isEqualTo(a.availableBalance());
      if (a.equivalent() != null)
        assertThat(a.equivalent().value().amount())
            .isEqualByComparingTo(
                a.balance()
                    .amount()
                    .multiply(a.equivalent().exchangeRate())
                    .setScale(2, RoundingMode.HALF_UP));
    }
    var current = accountQueries.detail(ReadDomainFixtures.ALEX, new AccountId("acc_current"));
    assertThat(current.account().balance().decimal()).isEqualTo("23842.31");
    assertThat(current.account().availableBalance().decimal()).isEqualTo("23810.31");
    assertThat(current.recentTransactions())
        .containsExactlyElementsOf(
            transactions.recent(ReadDomainFixtures.ALEX, new AccountId("acc_current"), 5));
    assertThat(accountQueries.list(ReadDomainFixtures.ALEX).totalBalance().decimal())
        .isEqualTo("36453.68");
    var usd = accountQueries.detail(ReadDomainFixtures.ALEX, new AccountId("acc_usd"));
    assertThat(usd.account().equivalent().value().decimal()).isEqualTo("4411.37");
  }

  @Test
  void overviewCompatibleAccountAndTransactionProjectionsShareValues() {
    for (var t : seed.transactions()) {
      var view = transactions.detail(ReadDomainFixtures.ALEX, t.id());
      assertThat(ReadModelMapper.transactionDetail(view).getAccount())
          .isEqualTo(
              ReadModelMapper.account(
                  accounts.find(ReadDomainFixtures.ALEX, t.accountId()).orElseThrow()));
    }
    var coffee =
        transactions.detail(ReadDomainFixtures.ALEX, new TransactionId("txn_coffee")).transaction();
    assertThat(coffee.bookedAt()).isNull();
    assertThat(coffee.merchant()).isNotNull();
    assertThat(coffee.counterparty()).isNull();
    var transfer =
        transactions
            .detail(ReadDomainFixtures.ALEX, new TransactionId("txn_history_0_07"))
            .transaction();
    assertThat(transfer.merchant()).isNull();
    assertThat(transfer.counterparty().name()).isEqualTo("Jamie Lee");
  }

  @ParameterizedTest
  @ValueSource(ints = {1, 2, 7, 10, 50})
  void keysetTraversalExactlyMatchesFullFilteredResults(int limit) {
    for (var q :
        List.of(
            filter(null, null, null, null, null, null, null, null, "", limit),
            filter("acc_current", null, null, null, null, null, null, null, "", limit),
            filter(
                null,
                "card_aster_debit",
                null,
                null,
                null,
                null,
                null,
                TransactionCategory.DINING,
                "",
                limit),
            filter(
                null,
                null,
                "2026-08-01T00:00:00+08:00",
                "2026-09-01T00:00:00+08:00",
                null,
                null,
                null,
                null,
                "",
                limit),
            filter(null, null, null, null, null, null, null, null, "home supplies", limit))) {
      var expected =
          repository.matching(ReadDomainFixtures.ALEX, q).stream().map(Transaction::id).toList();
      List<TransactionId> actual = new ArrayList<>();
      String cursor = null;
      int pages = 0;
      do {
        var page = transactions.list(ReadDomainFixtures.ALEX, q, cursor);
        actual.addAll(page.items().stream().map(Transaction::id).toList());
        assertThat(page.hasMore()).isEqualTo(page.nextCursor() != null);
        cursor = page.nextCursor();
        assertThat(++pages).isLessThan(100);
      } while (cursor != null);
      assertThat(actual).doesNotHaveDuplicates().containsExactlyElementsOf(expected);
    }
  }

  @Test
  void tieOrderingIsByInstantThenIdCodePoint() {
    var all = repository.matching(ReadDomainFixtures.ALEX, TransactionFilter.defaults());
    var tied =
        all.stream()
            .filter(t -> t.occurredAt().toInstant().equals(Instant.parse("2026-08-24T04:00:00Z")))
            .map(t -> t.id().value())
            .toList();
    assertThat(tied)
        .containsExactly(
            "txn_history_0_00",
            "txn_history_0_01",
            "txn_history_1_00",
            "txn_history_1_01",
            "txn_history_2_00",
            "txn_history_2_01");
  }

  @Test
  void changedFiltersCustomersRevisionsAndMissingAnchorsRejectCursor() {
    var q = TransactionFilter.defaults();
    String token = transactions.list(ReadDomainFixtures.ALEX, q, null).nextCursor();
    assertThatThrownBy(() -> transactions.list(ReadDomainFixtures.OTHER, q, token))
        .isInstanceOf(InvalidCursor.class);
    assertThatThrownBy(
            () ->
                transactions.list(
                    ReadDomainFixtures.ALEX,
                    filter(null, null, null, null, null, null, null, null, "", 11),
                    token))
        .isInstanceOf(InvalidCursor.class);
    var revised =
        new TransactionQueryService(
            new InMemoryTransactionRepository(seed.transactions(), "changed"),
            accounts::find,
            new CursorCodec());
    assertThatThrownBy(() -> revised.list(ReadDomainFixtures.ALEX, q, token))
        .isInstanceOf(InvalidCursor.class);
    var last = seed.transactions().getFirst();
    String missing =
        new CursorCodec()
            .encode(last, new CursorCodec().scope(ReadDomainFixtures.ALEX, q, "test-snapshot"));
    var shortened =
        new TransactionQueryService(
            new InMemoryTransactionRepository(
                seed.transactions().stream().filter(t -> !t.id().equals(last.id())).toList(),
                "test-snapshot"),
            accounts::find,
            new CursorCodec());
    assertThatThrownBy(() -> shortened.list(ReadDomainFixtures.ALEX, q, missing))
        .isInstanceOf(InvalidCursor.class);
  }

  @Test
  void malformedCursorPayloadsAreTypedErrors() throws Exception {
    var codec = new CursorCodec();
    String scope =
        codec.scope(ReadDomainFixtures.ALEX, TransactionFilter.defaults(), "test-snapshot");
    for (String token :
        List.of(
            "%bad",
            "a",
            "e30",
            "x".repeat(2049),
            payload(scope, "bad-time", "txn_coffee"),
            payload(scope, "2026-09-27T01:15:00Z", ""),
            payload(scope, "2026-09-27T01:15:00Z", "bad\nID")))
      assertThatThrownBy(() -> codec.decode(token, scope)).isInstanceOf(InvalidCursor.class);
  }

  private String payload(String scope, String time, String id) throws Exception {
    var bytes = new ByteArrayOutputStream();
    var out = new DataOutputStream(bytes);
    out.writeByte(1);
    out.writeUTF(scope);
    out.writeUTF(time);
    out.writeUTF(id);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes.toByteArray());
  }

  static TransactionFilter filter(
      String account,
      String card,
      String from,
      String to,
      TransactionStatus status,
      TransactionDirection direction,
      TransactionType type,
      TransactionCategory category,
      String search,
      int limit) {
    return new TransactionFilter(
        account == null ? null : new AccountId(account),
        card == null ? null : new CardId(card),
        from == null ? null : OffsetDateTime.parse(from),
        to == null ? null : OffsetDateTime.parse(to),
        status,
        direction,
        type,
        category,
        search,
        limit);
  }
}
