package com.asterbank.banking.customer.payment.adapter.persistence;

import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.payment.domain.*;
import java.util.function.Supplier;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;

/** All orchestration participates in one database transaction; no JVM locking. */
public final class PostgreSqlTransferExecutionBoundary implements TransferExecutionBoundary {
  private final TransactionTemplate writes;

  public PostgreSqlTransferExecutionBoundary(PlatformTransactionManager manager) {
    writes = new TransactionTemplate(manager);
    writes.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
  }

  public TransferIntent prepare(Supplier<TransferIntent> operation) {
    return run(operation);
  }

  public TransferIntent cancel(Supplier<TransferIntent> operation) {
    return run(operation);
  }

  public Transfer execute(Supplier<Transfer> operation) {
    return run(operation);
  }

  private <T> T run(Supplier<T> operation) {
    try {
      return writes.execute(status -> operation.get());
    } catch (PaymentFailure | com.asterbank.banking.security.application.SecurityFailure e) {
      throw e;
    } catch (RuntimeException e) {
      throw new PaymentFailure(PaymentFailure.Code.PERSISTENCE_UNAVAILABLE);
    }
  }
}
