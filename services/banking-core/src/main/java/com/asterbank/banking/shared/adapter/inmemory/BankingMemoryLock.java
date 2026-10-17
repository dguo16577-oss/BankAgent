package com.asterbank.banking.shared.adapter.inmemory;

import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

public final class BankingMemoryLock {
  private final ReentrantLock lock = new ReentrantLock();

  public <T> T read(Supplier<T> action) {
    lock.lock();
    try {
      return action.get();
    } finally {
      lock.unlock();
    }
  }

  public void write(Runnable action) {
    read(
        () -> {
          action.run();
          return null;
        });
  }
}
