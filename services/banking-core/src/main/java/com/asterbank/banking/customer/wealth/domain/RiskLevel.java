package com.asterbank.banking.customer.wealth.domain;

public enum RiskLevel {
  R1,
  R2,
  R3,
  R4,
  R5;

  public boolean permits(RiskLevel product) {
    return product.ordinal() <= ordinal();
  }
}
