package com.asterbank.banking.security.adapter.security;

import com.asterbank.banking.security.application.OtpGenerator;
import java.security.SecureRandom;
import java.util.Locale;

public final class SecureRandomOtpGenerator implements OtpGenerator {
  private final SecureRandom random = new SecureRandom();

  public String generate() {
    return String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
  }
}
