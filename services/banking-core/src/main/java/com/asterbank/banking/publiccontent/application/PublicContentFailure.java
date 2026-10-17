package com.asterbank.banking.publiccontent.application;

public final class PublicContentFailure extends RuntimeException {
  private final String code;
  private final int status;

  public PublicContentFailure(String code, int status, String message) {
    super(message);
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
