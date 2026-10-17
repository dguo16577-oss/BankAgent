package com.asterbank.banking.customer.transaction.application;

public final class InvalidCursor extends RuntimeException {
  public InvalidCursor() {
    super("Invalid cursor for this customer, snapshot or query. Start a new query.");
  }
}
