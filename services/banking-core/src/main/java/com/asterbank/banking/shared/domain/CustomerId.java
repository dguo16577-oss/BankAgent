package com.asterbank.banking.shared.domain;

public record CustomerId(String value) {
  public CustomerId {
    if (value == null || value.isBlank() || value.chars().anyMatch(Character::isISOControl))
      throw new IllegalArgumentException("Invalid opaque ID");
  }
}
