package com.asterbank.banking.customer.transaction.adapter.persistence;

import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.customer.transaction.domain.*;
import com.asterbank.banking.shared.domain.*;
import java.util.*;

public final class TransactionPersistenceMapper {
  private TransactionPersistenceMapper() {}

  public static Transaction domain(TransactionJpaEntity e) {
    return new Transaction(
        new TransactionId(e.transactionId),
        new CustomerId(e.customerId),
        new AccountId(e.accountId),
        e.title,
        new Money(e.amount, Currency.getInstance(e.currency)),
        TransactionDirection.valueOf(e.direction),
        TransactionStatus.valueOf(e.status),
        TransactionType.valueOf(e.type),
        TransactionCategory.valueOf(e.category),
        e.occurredAt,
        e.bookedAt,
        e.merchantName == null
            ? null
            : new Merchant(
                e.merchantId, e.merchantName, e.merchantLocation, e.merchantMaskedNumber),
        e.counterpartyName == null
            ? null
            : new Counterparty(e.counterpartyName, e.counterpartyMaskedNumber),
        e.cardId == null ? null : new CardId(e.cardId),
        e.cardMaskedNumber,
        e.reference,
        e.note);
  }

  public static TransactionJpaEntity entity(Transaction t) {
    var e = new TransactionJpaEntity();
    e.transactionId = t.id().value();
    e.customerId = t.customerId().value();
    e.accountId = t.accountId().value();
    e.cardId = t.cardId() == null ? null : t.cardId().value();
    e.cardMaskedNumber = t.cardMaskedNumber();
    e.title = t.title();
    e.amount = t.amount().amount();
    e.currency = t.amount().currency().getCurrencyCode();
    e.direction = t.direction().name();
    e.status = t.status().name();
    e.type = t.type().name();
    e.category = t.category().name();
    e.occurredAt = t.occurredAt();
    e.bookedAt = t.bookedAt();
    e.reference = t.reference();
    e.note = t.note();
    e.noteSearch = t.note() == null ? null : t.note().toLowerCase(Locale.ROOT);
    e.titleSearch = t.title().toLowerCase(Locale.ROOT);
    if (t.merchant() != null) {
      var m = t.merchant();
      e.merchantId = m.id();
      e.merchantName = m.name();
      e.merchantLocation = m.location();
      e.merchantMaskedNumber = m.maskedCardNumber();
      e.merchantSearch = m.name().toLowerCase(Locale.ROOT);
    }
    if (t.counterparty() != null) {
      e.counterpartyName = t.counterparty().name();
      e.counterpartyMaskedNumber = t.counterparty().maskedAccountNumber();
      e.counterpartySearch = t.counterparty().name().toLowerCase(Locale.ROOT);
    }
    return e;
  }
}
