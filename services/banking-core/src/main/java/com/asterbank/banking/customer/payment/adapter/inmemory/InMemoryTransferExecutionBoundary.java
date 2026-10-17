package com.asterbank.banking.customer.payment.adapter.inmemory;

import com.asterbank.banking.customer.account.adapter.inmemory.InMemoryAccountRepository;
import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.customer.transaction.adapter.inmemory.InMemoryTransactionRepository;
import com.asterbank.banking.shared.adapter.inmemory.BankingMemoryLock;
import java.util.function.Supplier;

/** Cross-repository rollback under the same lock used by reads. No partial state escapes. */
public final class InMemoryTransferExecutionBoundary implements TransferExecutionBoundary {
  private final BankingMemoryLock lock;
  private final InMemoryAccountRepository accounts;
  private final InMemoryTransactionRepository transactions;
  private final InMemoryTransferIntentRepository intents;
  private final InMemoryTransferRepository transfers;
  private final InMemoryIdempotencyRepository idempotency;

  public InMemoryTransferExecutionBoundary(
      BankingMemoryLock lock,
      InMemoryAccountRepository accounts,
      InMemoryTransactionRepository transactions,
      InMemoryTransferIntentRepository intents,
      InMemoryTransferRepository transfers,
      InMemoryIdempotencyRepository idempotency) {
    this.lock = lock;
    this.accounts = accounts;
    this.transactions = transactions;
    this.intents = intents;
    this.transfers = transfers;
    this.idempotency = idempotency;
  }

  public TransferIntent prepare(Supplier<TransferIntent> operation) {
    return lock.read(
        () -> {
          var before = intents.checkpoint();
          try {
            return operation.get();
          } catch (RuntimeException e) {
            intents.restore(before);
            throw translated(e);
          }
        });
  }

  public Transfer execute(Supplier<Transfer> operation) {
    return lock.read(
        () -> {
          var a = accounts.checkpoint();
          var t = transactions.checkpoint();
          var i = intents.checkpoint();
          var r = transfers.checkpoint();
          var k = idempotency.checkpoint();
          try {
            return operation.get();
          } catch (RuntimeException e) {
            accounts.restore(a);
            transactions.restore(t);
            intents.restore(i);
            transfers.restore(r);
            idempotency.restore(k);
            throw translated(e);
          }
        });
  }

  public TransferIntent cancel(Supplier<TransferIntent> operation) {
    return prepare(operation);
  }

  private RuntimeException translated(RuntimeException e) {
    return e instanceof PaymentFailure
        ? e
        : new PaymentFailure(PaymentFailure.Code.PERSISTENCE_UNAVAILABLE);
  }
}
