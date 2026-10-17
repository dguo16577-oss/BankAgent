package com.asterbank.banking.customer.payment.adapter.inmemory;

import com.asterbank.banking.customer.payment.application.IdempotencyRepository;
import com.asterbank.banking.shared.adapter.inmemory.BankingMemoryLock;
import java.util.*;

public class InMemoryIdempotencyRepository implements IdempotencyRepository {
  private final BankingMemoryLock lock;
  private Map<Scope, Completed> state = Map.of();

  public InMemoryIdempotencyRepository(BankingMemoryLock lock) {
    this.lock = lock;
  }

  public Optional<Completed> find(Scope scope) {
    return lock.read(() -> Optional.ofNullable(state.get(scope)));
  }

  public void save(Completed record) {
    lock.write(
        () -> {
          if (state.containsKey(record.scope()))
            throw new IllegalStateException("Duplicate idempotency record");
          var next = new HashMap<>(state);
          next.put(record.scope(), record);
          state = Map.copyOf(next);
        });
  }

  public Map<Scope, Completed> checkpoint() {
    return lock.read(() -> state);
  }

  public void restore(Map<Scope, Completed> before) {
    lock.write(() -> state = before);
  }
}
