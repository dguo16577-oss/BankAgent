package com.asterbank.banking.customer.payment.adapter.inmemory;

import com.asterbank.banking.customer.payment.application.TransferRepository;
import com.asterbank.banking.customer.payment.domain.Transfer;
import com.asterbank.banking.shared.adapter.inmemory.BankingMemoryLock;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.*;

public class InMemoryTransferRepository implements TransferRepository {
  private final BankingMemoryLock lock;
  private Map<String, Transfer> state = Map.of();

  public InMemoryTransferRepository(BankingMemoryLock lock) {
    this.lock = lock;
  }

  public Optional<Transfer> find(CustomerId customer, String id) {
    return lock.read(
        () -> Optional.ofNullable(state.get(id)).filter(t -> t.customerId().equals(customer)));
  }

  public void save(Transfer transfer) {
    lock.write(
        () -> {
          if (state.containsKey(transfer.id()))
            throw new IllegalStateException("Duplicate transfer");
          var next = new HashMap<>(state);
          next.put(transfer.id(), transfer);
          state = Map.copyOf(next);
        });
  }

  public Map<String, Transfer> checkpoint() {
    return lock.read(() -> state);
  }

  public void restore(Map<String, Transfer> before) {
    lock.write(() -> state = before);
  }
}
