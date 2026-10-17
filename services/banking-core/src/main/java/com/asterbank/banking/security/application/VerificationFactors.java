package com.asterbank.banking.security.application;

/** Credential/hash technology remains at the adapter boundary. */
public interface VerificationFactors {
  boolean passwordMatches(String customerId, String submitted);

  String hashOtp(String code);

  boolean otpMatches(String submitted, String hash);
}
