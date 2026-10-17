package com.asterbank.banking.customer.spending.application;

public final class SpendingFailure extends RuntimeException {
  public enum Code {
    INVALID_QUERY,
    ACCOUNT_NOT_FOUND,
    PERSISTENCE_UNAVAILABLE
  }

  private final Code code;

  public SpendingFailure(Code code) {
    super(code.name());
    this.code = code;
  }

  public Code code() {
    return code;
  }
}
