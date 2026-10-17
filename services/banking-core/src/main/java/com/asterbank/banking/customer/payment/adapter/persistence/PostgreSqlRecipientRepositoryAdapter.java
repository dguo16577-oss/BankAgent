package com.asterbank.banking.customer.payment.adapter.persistence;

import com.asterbank.banking.customer.payment.application.RecipientRepository;
import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.shared.adapter.persistence.DatabaseScope;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.*;

public final class PostgreSqlRecipientRepositoryAdapter implements RecipientRepository {
  private final DatabaseScope db;

  public PostgreSqlRecipientRepositoryAdapter(DatabaseScope db) {
    this.db = db;
  }

  public List<Recipient> list(CustomerId c) {
    return search(c, "");
  }

  public List<Recipient> search(CustomerId c, String search) {
    var phone = RecipientPhone.canonical(search);
    return db.read(
        () ->
            db
                .entityManager()
                .createQuery(
                    phone == null
                        ? "from RecipientJpaEntity where customerId=:c and (locate(:search, lower(displayName)) > 0 or locate(:search, lower(bankName)) > 0 or :search='') order by recipientId"
                        : "from RecipientJpaEntity where customerId=:c and phoneE164=:phone order by recipientId",
                    RecipientJpaEntity.class)
                .setParameter("c", c.value())
                .setParameter(phone == null ? "search" : "phone", phone == null ? search : phone)
                .getResultList()
                .stream()
                .map(PostgreSqlRecipientRepositoryAdapter::domain)
                .toList());
  }

  public Optional<Recipient> find(CustomerId c, RecipientId id) {
    return db.read(
        () ->
            db
                .entityManager()
                .createQuery(
                    "from RecipientJpaEntity where customerId=:c and recipientId=:id",
                    RecipientJpaEntity.class)
                .setParameter("c", c.value())
                .setParameter("id", id.value())
                .getResultList()
                .stream()
                .findFirst()
                .map(PostgreSqlRecipientRepositoryAdapter::domain));
  }

  public static Recipient domain(RecipientJpaEntity e) {
    return new Recipient(
        new RecipientId(e.recipientId),
        new CustomerId(e.customerId),
        e.displayName,
        e.bankName,
        e.maskedIdentifier,
        Currency.getInstance(e.currency),
        e.destinationRef,
        Recipient.Status.valueOf(e.status),
        e.createdAt,
        e.version,
        RecipientPhone.masked(e.phoneE164));
  }

  public static RecipientJpaEntity entity(Recipient r) {
    var e = new RecipientJpaEntity();
    e.recipientId = r.id().value();
    e.customerId = r.customerId().value();
    e.displayName = r.displayName();
    e.bankName = r.bankName();
    e.maskedIdentifier = r.maskedAccountNumber();
    e.currency = r.currency().getCurrencyCode();
    e.destinationRef = r.destinationRef();
    e.status = r.status().name();
    e.createdAt = r.createdAt();
    e.version = r.version();
    return e;
  }
}
