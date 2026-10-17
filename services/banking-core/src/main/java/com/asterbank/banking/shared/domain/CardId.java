package com.asterbank.banking.shared.domain;

public record CardId(String value) {
  public CardId {
    if (value == null || value.isBlank() || value.chars().anyMatch(Character::isISOControl))
      throw new IllegalArgumentException("Invalid opaque ID");
  }
}
