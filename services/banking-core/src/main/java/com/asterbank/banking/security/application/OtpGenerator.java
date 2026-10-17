package com.asterbank.banking.security.application;

@FunctionalInterface
public interface OtpGenerator {
  String generate();
}
