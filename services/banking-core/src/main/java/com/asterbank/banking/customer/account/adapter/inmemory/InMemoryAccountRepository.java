package com.asterbank.banking.customer.account.adapter.inmemory;

import com.asterbank.banking.customer.account.application.*;
import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.shared.adapter.inmemory.BankingMemoryLock;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.function.Supplier;

public class InMemoryAccountRepository implements AccountRepository, AccountMutationPort {
  public record State(List<Account> accounts, OffsetDateTime asOf) {
    public State {
      accounts = List.copyOf(accounts);
    }
  }

  private State state;
  private final BankingMemoryLock lock;

  public InMemoryAccountRepository(List<Account> accounts, OffsetDateTime asOf) {
    this(accounts, asOf, new BankingMemoryLock());
  }

  public InMemoryAccountRepository(
      List<Account> accounts, OffsetDateTime asOf, BankingMemoryLock lock) {
    state = new State(accounts, asOf);
    this.lock = lock;
  }

  public <T> T read(Supplier<T> action) {
    return lock.read(action);
  }

  public AccountSnapshot snapshot(CustomerId customer) {
    return read(
        () ->
            new AccountSnapshot(
                state.asOf(),
                state.accounts().stream().filter(a -> a.customerId().equals(customer)).toList()));
  }

  public Optional<Account> find(CustomerId customer, AccountId id) {
    return read(
        () ->
            state.accounts().stream()
                .filter(a -> a.customerId().equals(customer) && a.id().equals(id))
                .findFirst());
  }

  public void save(Account account, OffsetDateTime asOf) {
    lock.write(
        () -> {
          if (find(account.customerId(), account.id()).isEmpty())
            throw new IllegalStateException("Account missing");
          state =
              new State(
                  state.accounts().stream()
                      .map(
                          a ->
                              a.customerId().equals(account.customerId())
                                      && a.id().equals(account.id())
                                  ? account
                                  : a)
                      .toList(),
                  asOf);
        });
  }

  public State checkpoint() {
    return read(() -> state);
  }

  public void restore(State before) {
    lock.write(() -> state = before);
  }
}
