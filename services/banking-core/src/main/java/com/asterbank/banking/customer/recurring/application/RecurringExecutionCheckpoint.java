package com.asterbank.banking.customer.recurring.application;

public interface RecurringExecutionCheckpoint {
  enum Stage {
    AFTER_RECURRING_MUTATION,
    BEFORE_ACTION_PERSISTENCE,
    BEFORE_IDEMPOTENCY_COMPLETION
  }

  void reached(Stage stage);
}
