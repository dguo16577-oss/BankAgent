package com.asterbank.banking.customer.payment.application;

@FunctionalInterface
public interface IdGenerator {
  String next(String prefix);
}
