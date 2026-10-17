package com.asterbank.banking.customer.account.application;

public final class AccountNotFound extends RuntimeException {
  public AccountNotFound() {
    super("Account not found.");
  }
}
