package com.asterbank.banking.customer.payment.adapter.inmemory;

import com.asterbank.banking.customer.payment.application.RecipientRepository;
import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.shared.adapter.inmemory.BankingMemoryLock;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.*;

public final class InMemoryRecipientRepository implements RecipientRepository {
  private final BankingMemoryLock lock;
  private final List<Recipient> recipients;

  public InMemoryRecipientRepository(List<Recipient> recipients, BankingMemoryLock lock) {
    this.recipients = List.copyOf(recipients);
    this.lock = lock;
  }

  public List<Recipient> list(CustomerId customer) {
    return lock.read(
        () -> recipients.stream().filter(r -> r.customerId().equals(customer)).toList());
  }

  public Optional<Recipient> find(CustomerId customer, RecipientId id) {
    return list(customer).stream().filter(r -> r.id().equals(id)).findFirst();
  }
}
