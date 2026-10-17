package com.asterbank.banking.customer.card.application;

public final class CardFailure extends RuntimeException {
  public enum Code {
    CARD_NOT_FOUND,
    CARD_ACTION_INTENT_NOT_FOUND,
    CARD_ACTION_NOT_FOUND,
    CARD_ACTION_INTENT_HASH_MISMATCH,
    CARD_ACTION_INTENT_ALREADY_EXECUTED,
    CARD_ACTION_INTENT_CANCELLED,
    CARD_ACTION_INTENT_EXPIRED,
    CARD_STATE_CHANGED,
    IDEMPOTENCY_KEY_REUSED,
    INVALID_REQUEST,
    PERSISTENCE_UNAVAILABLE
  }

  private final Code code;

  public CardFailure(Code code) {
    super("Card request could not be completed.");
    this.code = code;
  }

  public Code code() {
    return code;
  }
}
