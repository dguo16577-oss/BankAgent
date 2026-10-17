package com.asterbank.banking.customer.account.adapter.persistence;

import com.asterbank.banking.customer.account.application.*;
import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.shared.adapter.persistence.DatabaseScope;
import com.asterbank.banking.shared.domain.CustomerId;
import jakarta.persistence.LockModeType;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public final class PostgreSqlAccountRepositoryAdapter
    implements AccountRepository, AccountMutationPort {
  private final DatabaseScope db;
  private final AccountSpringDataRepository data;

  public PostgreSqlAccountRepositoryAdapter(DatabaseScope db, AccountSpringDataRepository data) {
    this.db = db;
    this.data = data;
  }

  public <T> T read(Supplier<T> action) {
    return db.read(action);
  }

  public AccountSnapshot snapshot(CustomerId c) {
    return read(
        () -> {
          var em = db.entityManager();
          var rows = data.findAllByCustomerIdOrderByAccountId(c.value());
          var times =
              em.unwrap(org.hibernate.Session.class)
                  .createNativeQuery(
                      "select account_as_of from customers where customer_id=:c",
                      OffsetDateTime.class)
                  .setParameter("c", c.value())
                  .getResultList();
          return new AccountSnapshot(
              times.isEmpty()
                  ? OffsetDateTime.ofInstant(Instant.EPOCH, ZoneOffset.UTC)
                  : times.getFirst(),
              rows.stream().map(AccountPersistenceMapper::domain).toList());
        });
  }

  public Optional<Account> find(CustomerId c, AccountId id) {
    return read(
        () -> {
          db.lockOwnerForWrite(c);
          var q =
              db.entityManager()
                  .createQuery(
                      "from AccountJpaEntity where accountId=:id and customerId=:c",
                      AccountJpaEntity.class)
                  .setParameter("id", id.value())
                  .setParameter("c", c.value());
          if (!TransactionSynchronizationManager.isCurrentTransactionReadOnly())
            q.setLockMode(LockModeType.PESSIMISTIC_WRITE);
          return q.getResultList().stream().findFirst().map(AccountPersistenceMapper::domain);
        });
  }

  public void save(Account a, OffsetDateTime asOf) {
    if (find(a.customerId(), a.id()).isEmpty())
      throw new IllegalStateException("Owned account missing");
    db.entityManager().merge(AccountPersistenceMapper.entity(a));
    db.entityManager()
        .unwrap(org.hibernate.Session.class)
        .createNativeQuery("update customers set account_as_of=:time where customer_id=:c")
        .setParameter("time", asOf)
        .setParameter("c", a.customerId().value())
        .executeUpdate();
    db.entityManager().flush();
  }
}
