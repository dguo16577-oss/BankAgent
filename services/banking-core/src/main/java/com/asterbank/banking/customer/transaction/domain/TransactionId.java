package com.asterbank.banking.customer.transaction.domain;

public record TransactionId(String value) {
  public TransactionId {
    if (value == null || value.isBlank() || value.chars().anyMatch(Character::isISOControl))
      throw new IllegalArgumentException("Invalid opaque ID");
  }
}
