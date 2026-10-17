package com.asterbank.banking.customer.transaction.adapter.inmemory;

import com.asterbank.banking.customer.transaction.application.*;
import com.asterbank.banking.customer.transaction.domain.*;
import com.asterbank.banking.shared.adapter.inmemory.BankingMemoryLock;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.*;
import java.util.function.Supplier;

public class InMemoryTransactionRepository
    implements TransactionRepository, TransactionMutationPort {
  public record State(List<Transaction> transactions, String revision) {
    public State {
      transactions = List.copyOf(transactions);
    }
  }

  private State state;
  private final BankingMemoryLock lock;
  private final String initialRevision;

  public InMemoryTransactionRepository(List<Transaction> transactions, String revision) {
    this(transactions, revision, new BankingMemoryLock());
  }

  public InMemoryTransactionRepository(
      List<Transaction> transactions, String revision, BankingMemoryLock lock) {
    state = new State(transactions, revision);
    this.initialRevision = revision;
    this.lock = lock;
  }

  public <T> T read(Supplier<T> action) {
    return lock.read(action);
  }

  public List<Transaction> matching(CustomerId customer, TransactionFilter filter) {
    return read(
        () ->
            state.transactions().stream()
                .filter(t -> t.customerId().equals(customer))
                .filter(filter::matches)
                .sorted(Transaction.ORDER)
                .toList());
  }

  public Optional<Transaction> find(CustomerId customer, TransactionId id) {
    return read(
        () ->
            state.transactions().stream()
                .filter(t -> t.customerId().equals(customer) && t.id().equals(id))
                .findFirst());
  }

  public String snapshotRevision() {
    return read(() -> state.revision());
  }

  public void append(Transaction transaction) {
    lock.write(
        () -> {
          if (state.transactions().stream().anyMatch(t -> t.id().equals(transaction.id())))
            throw new IllegalStateException("Duplicate transaction");
          var next = new ArrayList<>(state.transactions());
          next.add(transaction);
          state = new State(next, initialRevision + ":" + next.size());
        });
  }

  public State checkpoint() {
    return read(() -> state);
  }

  public void restore(State before) {
    lock.write(() -> state = before);
  }
}
