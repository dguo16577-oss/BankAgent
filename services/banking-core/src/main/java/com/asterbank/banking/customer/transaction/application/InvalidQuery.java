package com.asterbank.banking.customer.transaction.application;

public final class InvalidQuery extends RuntimeException {
  public InvalidQuery() {
    super("Invalid transaction query.");
  }
}
