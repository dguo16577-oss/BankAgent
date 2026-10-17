package com.asterbank.banking.customer.recurring.domain;

public final class RecurringFailure extends RuntimeException {
  public enum Code {
    RECURRING_PAYMENT_NOT_FOUND,
    RECURRING_PAYMENT_INTENT_NOT_FOUND,
    RECURRING_PAYMENT_ACTION_NOT_FOUND,
    RECURRING_PAYMENT_ALREADY_STOPPED,
    RECURRING_PAYMENT_STATE_CHANGED,
    RECURRING_PAYMENT_INTENT_EXPIRED,
    RECURRING_PAYMENT_INTENT_HASH_MISMATCH,
    RECURRING_PAYMENT_INTENT_ALREADY_EXECUTED,
    RECURRING_PAYMENT_INTENT_CANCELLED,
    RECURRING_PAYMENT_NOT_MANAGEABLE,
    IDEMPOTENCY_KEY_REUSED,
    INVALID_REQUEST,
    PERSISTENCE_UNAVAILABLE
  }

  private final Code code;

  public RecurringFailure(Code code) {
    super(code.name());
    this.code = code;
  }

  public Code code() {
    return code;
  }
}
