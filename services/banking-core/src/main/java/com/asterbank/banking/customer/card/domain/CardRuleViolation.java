package com.asterbank.banking.customer.card.domain;

public final class CardRuleViolation extends RuntimeException {
  public enum Code {
    CARD_NOT_ELIGIBLE,
    NO_CARD_CHANGES,
    CARD_STATE_CHANGED,
    INVALID_REQUEST,
    CARD_LIMIT_EXCEEDED
  }

  private final Code code;

  public CardRuleViolation(Code code) {
    super("Card action is not valid for the reviewed state.");
    this.code = code;
  }

  public Code code() {
    return code;
  }
}
