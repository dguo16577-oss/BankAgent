package com.asterbank.banking.security.domain;

public enum VerificationRequirement {
  NONE,
  PASSWORD,
  SMS_OTP,
  PASSWORD_AND_SMS_OTP;

  public boolean password() {
    return this == PASSWORD || this == PASSWORD_AND_SMS_OTP;
  }

  public boolean sms() {
    return this == SMS_OTP || this == PASSWORD_AND_SMS_OTP;
  }
}
