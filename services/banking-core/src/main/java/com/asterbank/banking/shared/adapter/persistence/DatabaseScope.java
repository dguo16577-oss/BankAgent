package com.asterbank.banking.shared.adapter.persistence;

import com.asterbank.banking.shared.domain.CustomerId;
import jakarta.persistence.EntityManager;
import java.util.function.Supplier;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;

/** Repeatable read projections; write transactions coordinate on the owned customer row first. */
public final class DatabaseScope {
  private final TransactionTemplate reads;
  private final EntityManager em;

  public DatabaseScope(PlatformTransactionManager manager, EntityManager em) {
    this.em = em;
    reads = new TransactionTemplate(manager);
    reads.setReadOnly(true);
    reads.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
  }

  public <T> T read(Supplier<T> action) {
    return reads.execute(status -> action.get());
  }

  public void lockOwnerForWrite(CustomerId customer) {
    if (TransactionSynchronizationManager.isActualTransactionActive()
        && !TransactionSynchronizationManager.isCurrentTransactionReadOnly())
      em.unwrap(org.hibernate.Session.class)
          .createNativeQuery(
              "select customer_id from customers where customer_id=:customer for no key update",
              String.class)
          .setParameter("customer", customer.value())
          .getResultList();
  }

  public EntityManager entityManager() {
    return em;
  }
}
