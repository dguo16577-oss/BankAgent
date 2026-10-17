package com.asterbank.banking.shared.web;

import com.asterbank.banking.customer.account.application.*;
import com.asterbank.banking.customer.account.domain.Account;
import com.asterbank.banking.customer.transaction.application.TransactionDetailView;
import com.asterbank.banking.customer.transaction.domain.Transaction;
import com.asterbank.contract.customer.model.*;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;

public final class ReadModelMapper {
  private ReadModelMapper() {}

  public static String time(OffsetDateTime value) {
    return value == null ? null : value.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
  }

  public static Money money(com.asterbank.banking.shared.domain.Money m) {
    return new Money(
        m.amount().setScale(2).toPlainString(),
        Money.CurrencyEnum.fromValue(m.currency().getCurrencyCode()));
  }

  public static ExchangeEquivalent equivalent(
      com.asterbank.banking.customer.account.domain.ExchangeEquivalent e) {
    if (e == null) return null;
    return new ExchangeEquivalent()
        .value(money(e.value()))
        .sourceCurrency(
            ExchangeEquivalent.SourceCurrencyEnum.fromValue(e.sourceCurrency().getCurrencyCode()))
        .exchangeRate(e.exchangeRate().toPlainString())
        .conversionAsOf(time(e.conversionAsOf()))
        .conversionSource(ExchangeEquivalent.ConversionSourceEnum.DEMO_RATE);
  }

  public static AccountsResponse accounts(AccountSnapshot snapshot) {
    return new AccountsResponse(
        time(snapshot.asOf()),
        AccountsResponse.BaseCurrencyEnum.CNY,
        money(snapshot.totalBalance()),
        snapshot.accounts().stream().map(ReadModelMapper::account).toList(),
        snapshot.accounts().stream()
            .filter(a -> a.equivalent() != null)
            .map(a -> equivalent(a.equivalent()))
            .toList());
  }

  public static AccountSummary account(Account a) {
    return new AccountSummary()
        .id(a.id().value())
        .displayName(a.displayName())
        .type(toApi(a.type()))
        .status(toApi(a.status()))
        .currency(AccountSummary.CurrencyEnum.fromValue(a.balance().currency().getCurrencyCode()))
        .balance(money(a.balance()))
        .pendingAmount(money(a.pendingAmount()))
        .availableBalance(money(a.availableBalance()))
        .maskedAccountNumber(a.maskedAccountNumber())
        .baseCurrencyEquivalent(equivalent(a.equivalent()));
  }

  public static AccountDetail accountDetail(AccountView view) {
    Account a = view.account();
    return new AccountDetail()
        .id(a.id().value())
        .displayName(a.displayName())
        .type(toApi(a.type()))
        .status(toApi(a.status()))
        .currency(AccountDetail.CurrencyEnum.fromValue(a.balance().currency().getCurrencyCode()))
        .balance(money(a.balance()))
        .pendingAmount(money(a.pendingAmount()))
        .availableBalance(money(a.availableBalance()))
        .maskedAccountNumber(a.maskedAccountNumber())
        .baseCurrencyEquivalent(equivalent(a.equivalent()))
        .asOf(time(view.asOf()))
        .openedAt(time(a.openedAt()))
        .recentTransactions(
            view.recentTransactions().stream().map(ReadModelMapper::transaction).toList());
  }

  private static MerchantSummary merchant(Transaction t) {
    var m = t.merchant();
    return m == null
        ? null
        : new MerchantSummary()
            .id(m.id())
            .name(m.name())
            .location(m.location())
            .maskedCardNumber(m.maskedCardNumber());
  }

  private static CounterpartySummary counterparty(Transaction t) {
    var c = t.counterparty();
    return c == null
        ? null
        : new CounterpartySummary().name(c.name()).maskedAccountNumber(c.maskedAccountNumber());
  }

  public static TransactionSummary transaction(Transaction t) {

    return new TransactionSummary()
        .id(t.id().value())
        .accountId(t.accountId().value())
        .title(t.title())
        .amount(
            new TransactionSummaryAmount(
                t.amount().decimal(),
                TransactionSummaryAmount.CurrencyEnum.fromValue(
                    t.amount().currency().getCurrencyCode())))
        .direction(toApi(t.direction()))
        .status(toApi(t.status()))
        .type(toApi(t.type()))
        .category(toApi(t.category()))
        .occurredAt(time(t.occurredAt()))
        .bookedAt(time(t.bookedAt()))
        .merchant(merchant(t))
        .counterparty(counterparty(t))
        .cardId(t.cardId() == null ? null : t.cardId().value())
        .cardMaskedNumber(t.cardMaskedNumber())
        .note(t.note())
        .reference(t.reference());
  }

  public static TransactionDetail transactionDetail(TransactionDetailView view) {
    Transaction t = view.transaction();
    return new TransactionDetail()
        .id(t.id().value())
        .accountId(t.accountId().value())
        .title(t.title())
        .amount(
            new TransactionSummaryAmount(
                t.amount().decimal(),
                TransactionSummaryAmount.CurrencyEnum.fromValue(
                    t.amount().currency().getCurrencyCode())))
        .direction(toApi(t.direction()))
        .status(toApi(t.status()))
        .type(toApi(t.type()))
        .category(toApi(t.category()))
        .occurredAt(time(t.occurredAt()))
        .bookedAt(time(t.bookedAt()))
        .merchant(merchant(t))
        .counterparty(counterparty(t))
        .cardId(t.cardId() == null ? null : t.cardId().value())
        .cardMaskedNumber(t.cardMaskedNumber())
        .note(t.note())
        .reference(t.reference() == null ? "ASTER-" + t.id().value() : t.reference())
        .account(account(view.account()));
  }

  public static TransactionPage page(
      com.asterbank.banking.customer.transaction.application.TransactionPage page) {
    return new TransactionPage(
        page.items().stream().map(ReadModelMapper::transaction).toList(),
        page.nextCursor(),
        page.hasMore());
  }

  public static AccountType toApi(com.asterbank.banking.customer.account.domain.AccountType value) {
    return switch (value) {
      case CURRENT -> AccountType.CURRENT;
      case SAVINGS -> AccountType.SAVINGS;
      case MULTI_CURRENCY -> AccountType.MULTI_CURRENCY;
      case TIME_DEPOSIT -> AccountType.TIME_DEPOSIT;
    };
  }

  public static AccountStatus toApi(
      com.asterbank.banking.customer.account.domain.AccountStatus value) {
    return switch (value) {
      case ACTIVE -> AccountStatus.ACTIVE;
      case RESTRICTED -> AccountStatus.RESTRICTED;
      case FROZEN -> AccountStatus.FROZEN;
      case CLOSED -> AccountStatus.CLOSED;
    };
  }

  public static TransactionStatus toApi(
      com.asterbank.banking.customer.transaction.domain.TransactionStatus value) {
    return switch (value) {
      case PENDING -> TransactionStatus.PENDING;
      case COMPLETED -> TransactionStatus.COMPLETED;
      case FAILED -> TransactionStatus.FAILED;
      case REVERSED -> TransactionStatus.REVERSED;
      case CANCELLED -> TransactionStatus.CANCELLED;
    };
  }

  public static TransactionDirection toApi(
      com.asterbank.banking.customer.transaction.domain.TransactionDirection value) {
    return switch (value) {
      case CREDIT -> TransactionDirection.CREDIT;
      case DEBIT -> TransactionDirection.DEBIT;
    };
  }

  public static TransactionType toApi(
      com.asterbank.banking.customer.transaction.domain.TransactionType value) {
    return switch (value) {
      case CARD_PAYMENT -> TransactionType.CARD_PAYMENT;
      case BANK_TRANSFER -> TransactionType.BANK_TRANSFER;
      case SALARY -> TransactionType.SALARY;
      case DIRECT_DEBIT -> TransactionType.DIRECT_DEBIT;
      case CASH_WITHDRAWAL -> TransactionType.CASH_WITHDRAWAL;
      case FEE -> TransactionType.FEE;
      case INTEREST -> TransactionType.INTEREST;
      case FX_EXCHANGE -> TransactionType.FX_EXCHANGE;
      case INVESTMENT_PURCHASE -> TransactionType.INVESTMENT_PURCHASE;
      case INVESTMENT_REDEMPTION -> TransactionType.INVESTMENT_REDEMPTION;
    };
  }

  public static TransactionCategory toApi(
      com.asterbank.banking.customer.transaction.domain.TransactionCategory value) {
    return switch (value) {
      case DINING -> TransactionCategory.DINING;
      case GROCERIES -> TransactionCategory.GROCERIES;
      case SHOPPING -> TransactionCategory.SHOPPING;
      case TRANSPORT -> TransactionCategory.TRANSPORT;
      case ENTERTAINMENT -> TransactionCategory.ENTERTAINMENT;
      case SUBSCRIPTIONS -> TransactionCategory.SUBSCRIPTIONS;
      case HOUSING -> TransactionCategory.HOUSING;
      case INCOME -> TransactionCategory.INCOME;
      case TRANSFER -> TransactionCategory.TRANSFER;
      case TRAVEL -> TransactionCategory.TRAVEL;
      case HEALTH -> TransactionCategory.HEALTH;
      case OTHER -> TransactionCategory.OTHER;
      case INVESTMENT -> TransactionCategory.INVESTMENT;
    };
  }
}
