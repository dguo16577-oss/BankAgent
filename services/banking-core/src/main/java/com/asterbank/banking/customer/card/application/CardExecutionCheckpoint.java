package com.asterbank.banking.customer.card.application;

/** Observational hook. Production has a no-op implementation; fault injection is test-only. */
public interface CardExecutionCheckpoint {
  enum Stage {
    AFTER_CARD_MUTATION,
    BEFORE_ACTION_PERSISTENCE,
    BEFORE_AUTHORIZATION_CONSUMPTION,
    AFTER_AUTHORIZATION_CONSUMPTION
  }

  void reached(Stage stage);
}
