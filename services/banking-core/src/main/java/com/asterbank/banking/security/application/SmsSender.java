package com.asterbank.banking.security.application;

import java.time.Instant;

public interface SmsSender {
  boolean available();

  boolean demoInboxAvailable();

  void send(String customer, String phone, String challenge, String code, Instant at);
}
