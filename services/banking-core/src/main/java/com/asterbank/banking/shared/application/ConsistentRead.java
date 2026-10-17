package com.asterbank.banking.shared.application;

import java.util.function.Supplier;

/** Read scope for queries combining related resources. */
public interface ConsistentRead {
  default <T> T read(Supplier<T> query) {
    return query.get();
  }
}
