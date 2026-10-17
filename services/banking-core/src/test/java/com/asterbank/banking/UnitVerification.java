package com.asterbank.banking;

import com.asterbank.banking.security.application.*;
import com.asterbank.banking.security.domain.*;
import com.asterbank.banking.security.domain.SecurityState.*;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;

/** Test-only persistence adapter. PostgreSQL tests cover locking and transaction participation. */
final class UnitVerification implements SecurityStore {
  Map<String, Session> sessions = new HashMap<>();
  Map<String, Challenge> challenges = new HashMap<>();
  Map<String, Authorization> grants = new HashMap<>();
  final SecurityService service;

  UnitVerification(Clock clock) {
    var encoder = new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(4);
    var hash = encoder.encode("test-password");
    service =
        new SecurityService(
            this,
            clock,
            new VerificationFactors() {
              public boolean passwordMatches(String customer, String submitted) {
                return submitted != null && encoder.matches(submitted, hash);
              }

              public String hashOtp(String code) {
                return encoder.encode(code);
              }

              public boolean otpMatches(String code, String hash) {
                return code != null && encoder.matches(code, hash);
              }
            },
            () -> "012345",
            new SmsSender() {
              public boolean available() {
                return true;
              }

              public boolean demoInboxAvailable() {
                return false;
              }

              public void send(String c, String p, String id, String code, Instant at) {}
            },
            Duration.ofHours(1));
  }

  public synchronized <T> T transaction(Supplier<T> work) {
    var oldS = new HashMap<>(sessions);
    var oldC = new HashMap<>(challenges);
    var oldG = new HashMap<>(grants);
    try {
      return work.get();
    } catch (RuntimeException e) {
      sessions = oldS;
      challenges = oldC;
      grants = oldG;
      throw e;
    }
  }

  public PhoneBinding phone(String c) {
    return new PhoneBinding("+8613812345678", true);
  }

  public SmsMessage sms(String c, String id) {
    return null;
  }

  public Challenge pending(Binding b, String action) {
    return challenges.values().stream()
        .filter(
            c ->
                c.binding().equals(b)
                    && c.action().name().equals(action)
                    && c.status() == ChallengeStatus.PENDING)
        .findFirst()
        .orElse(null);
  }

  public Session session(String id) {
    return sessions.get(id);
  }

  public void save(Session s) {
    sessions.put(s.id(), s);
  }

  public Challenge challenge(String id) {
    return challenges.get(id);
  }

  public void save(Challenge c) {
    challenges.put(c.id(), c);
  }

  public Authorization authorization(String id) {
    return grants.get(id);
  }

  public void save(Authorization a) {
    grants.put(a.id(), a);
  }

  public void revoke(String id) {}

  public void supersede(Binding b) {}

  public void event(
      String c, String s, String t, String r, Instant at, String correlation, String outcome) {}

  synchronized String authorize(String customer, String id, String hash) {
    return authorize(customer, customer, id, hash);
  }

  synchronized String authorize(String customer, String session, String id, String hash) {
    var old = grants.values().stream().filter(a -> a.binding().resourceId().equals(id)).findFirst();
    if (old.isPresent()) return old.get().id();
    if (!sessions.containsKey(session)) service.login(customer, session, null);
    var c =
        service.create(
            new Binding(customer, session, "TRANSFER_INTENT", id, hash),
            VerificationAction.TRANSFER_EXECUTE,
            null);
    return service.verify(customer, session, c.id(), "012345", null, null).authorization().id();
  }
}
