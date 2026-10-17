package com.asterbank.banking.customer.wealth.application;

/** Fault injection seam for proving shared-transaction rollback. */
public interface WealthExecutionCheckpoint {
  enum Stage {
    AFTER_ACCOUNT_DEBIT,
    AFTER_POSITION_UPDATE,
    AFTER_TRANSACTION_APPEND,
    AFTER_ORDER_INSERT,
    BEFORE_IDEMPOTENCY_COMPLETION
  }

  void reached(Stage stage);
}
