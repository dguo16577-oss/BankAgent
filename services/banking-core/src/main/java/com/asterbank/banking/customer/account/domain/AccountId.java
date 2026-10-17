package com.asterbank.banking.customer.account.domain;

public record AccountId(String value) {
  public AccountId {
    if (value == null || value.isBlank() || value.chars().anyMatch(Character::isISOControl))
      throw new IllegalArgumentException("Invalid opaque ID");
  }
}
