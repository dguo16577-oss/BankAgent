package com.asterbank.banking.customer.deposit;

public final class DepositFailure extends RuntimeException {
  private final String code;
  private final int status;

  public DepositFailure(String code, int status) {
    super(code);
    this.code = code;
    this.status = status;
  }

  public String code() {
    return code;
  }

  public int status() {
    return status;
  }
}
