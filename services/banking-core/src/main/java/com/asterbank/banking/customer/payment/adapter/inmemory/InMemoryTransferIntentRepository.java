package com.asterbank.banking.customer.payment.adapter.inmemory;

import com.asterbank.banking.customer.payment.application.TransferIntentRepository;
import com.asterbank.banking.customer.payment.domain.TransferIntent;
import com.asterbank.banking.shared.adapter.inmemory.BankingMemoryLock;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.*;

public class InMemoryTransferIntentRepository implements TransferIntentRepository {
  private final BankingMemoryLock lock;
  private Map<String, TransferIntent> state = Map.of();
  private final Map<String, PrepareReplay> prepareKeys = new HashMap<>();

  public InMemoryTransferIntentRepository(BankingMemoryLock lock) {
    this.lock = lock;
  }

  public Optional<TransferIntent> find(CustomerId customer, String id) {
    return lock.read(
        () ->
            Optional.ofNullable(state.get(id))
                .filter(i -> i.terms().customerId().equals(customer)));
  }

  public void save(TransferIntent intent) {
    lock.write(
        () -> {
          var old = state.get(intent.terms().id());
          if (old != null
              && old.status() != TransferIntent.Status.PREPARED
              && old.status() != intent.status())
            throw new IllegalStateException("Completed intent lifecycle cannot be reversed");
          if (old != null
              && (!old.terms().equals(intent.terms())
                  || !old.intentHash().equals(intent.intentHash())))
            throw new IllegalStateException("Immutable intent terms changed");
          var next = new HashMap<>(state);
          next.put(intent.terms().id(), intent);
          state = Map.copyOf(next);
        });
  }

  public void cancel(TransferIntent intent, String reason) {
    save(intent);
  }

  private static String replayKey(CustomerId c, String session, String key) {
    return c.value() + "\u0000" + session + "\u0000" + key;
  }

  public Optional<PrepareReplay> findPrepareReplay(CustomerId c, String session, String key) {
    return lock.read(() -> Optional.ofNullable(prepareKeys.get(replayKey(c, session, key))));
  }

  public void savePrepareReplay(
      CustomerId c,
      String session,
      String key,
      String fingerprint,
      String intentId,
      java.time.OffsetDateTime createdAt) {
    lock.write(
        () -> {
          var previous =
              prepareKeys.putIfAbsent(
                  replayKey(c, session, key), new PrepareReplay(fingerprint, intentId));
          if (previous != null) throw new IllegalStateException("Duplicate prepare key");
        });
  }

  public Map<String, TransferIntent> checkpoint() {
    return lock.read(() -> state);
  }

  public void restore(Map<String, TransferIntent> before) {
    lock.write(() -> state = before);
  }
}
