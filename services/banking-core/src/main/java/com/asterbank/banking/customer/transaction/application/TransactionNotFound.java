package com.asterbank.banking.customer.transaction.application;

public final class TransactionNotFound extends RuntimeException {
  public TransactionNotFound() {
    super("Transaction not found.");
  }
}
