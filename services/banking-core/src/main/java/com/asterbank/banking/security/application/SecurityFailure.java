package com.asterbank.banking.security.application;

public final class SecurityFailure extends RuntimeException {
  private final String code;
  private final int status;

  public SecurityFailure(String code, int status) {
    super("Security request rejected.");
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
