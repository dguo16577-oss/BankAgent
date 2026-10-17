package com.asterbank.banking.customer.applicationrequest.domain;

public final class ApplicationFailure extends RuntimeException {
  public enum Code {
    INVALID_REQUEST,
    ACCOUNT_NOT_FOUND,
    APPLICATION_NOT_FOUND,
    APPLICATION_ALREADY_SUBMITTED,
    APPLICATION_INTENT_CANCELLED,
    PRODUCT_NOT_APPLICABLE,
    IDEMPOTENCY_KEY_REUSED
  }

  private final Code code;

  public ApplicationFailure(Code code) {
    super("Application request could not be completed.");
    this.code = code;
  }

  public Code code() {
    return code;
  }
}
