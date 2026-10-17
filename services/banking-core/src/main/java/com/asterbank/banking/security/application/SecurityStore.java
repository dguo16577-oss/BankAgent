package com.asterbank.banking.security.application;

import com.asterbank.banking.security.domain.SecurityState.*;
import java.time.Instant;
import java.util.function.Supplier;

public interface SecurityStore {
  <T> T transaction(Supplier<T> work);

  PhoneBinding phone(String customer);

  SmsMessage sms(String customer, String challenge);

  Challenge pending(Binding binding, String action);

  Session session(String id);

  void save(Session session);

  Challenge challenge(String id);

  void save(Challenge challenge);

  Authorization authorization(String id);

  void save(Authorization authorization);

  void revoke(String sessionId);

  void supersede(Binding binding);

  void event(
      String customer,
      String session,
      String type,
      String resource,
      Instant at,
      String correlation,
      String outcome);
}
