package com.asterbank.banking.customer.card.application;

public final class CreditLimitFailure extends RuntimeException {
  public enum Code {
    INVALID_REQUEST,
    CREDIT_LIMIT_INTENT_NOT_FOUND,
    CREDIT_LIMIT_APPLICATION_NOT_FOUND,
    CREDIT_LIMIT_NOT_ELIGIBLE,
    CREDIT_LIMIT_INTENT_CANCELLED,
    CREDIT_LIMIT_INTENT_EXPIRED,
    IDEMPOTENCY_KEY_REUSED
  }

  private final Code code;

  public CreditLimitFailure(Code code) {
    super("Credit limit request could not be completed.");
    this.code = code;
  }

  public Code code() {
    return code;
  }
}
