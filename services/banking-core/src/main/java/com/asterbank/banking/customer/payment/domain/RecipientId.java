package com.asterbank.banking.customer.payment.domain;

public record RecipientId(String value) {
  public RecipientId {
    if (value == null || value.isBlank() || value.codePoints().anyMatch(Character::isISOControl))
      throw new IllegalArgumentException("Invalid recipient ID");
  }
}
