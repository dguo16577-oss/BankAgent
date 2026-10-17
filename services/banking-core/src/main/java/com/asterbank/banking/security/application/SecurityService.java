package com.asterbank.banking.security.application;

import com.asterbank.banking.security.domain.*;
import com.asterbank.banking.security.domain.SecurityState.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import java.util.function.Supplier;

public final class SecurityService implements ActionAuthorizationService {
  private final SecurityStore store;
  private final Clock clock;
  private final VerificationFactors factors;
  private final OtpGenerator otp;
  private final SmsSender sms;
  private final Duration timeout;

  public SecurityService(
      SecurityStore store,
      Clock clock,
      VerificationFactors factors,
      OtpGenerator otp,
      SmsSender sms,
      Duration timeout) {
    this.store = store;
    this.clock = clock;
    this.factors = factors;
    this.otp = otp;
    this.sms = sms;
    this.timeout = timeout;
  }

  private Instant now() {
    return clock.instant().truncatedTo(ChronoUnit.MICROS);
  }

  private String id() {
    return UUID.randomUUID().toString();
  }

  // Persist expected failure transitions (attempts/expiry), then report outside the transaction.
  private record Result<T>(T value, SecurityFailure failure) {}

  private <T> T run(Supplier<T> work) {
    Result<T> r =
        store.transaction(
            () -> {
              try {
                return new Result<>(work.get(), null);
              } catch (SecurityFailure f) {
                return new Result<>(null, f);
              }
            });
    if (r.failure() != null) throw r.failure();
    return r.value();
  }

  private SecurityFailure fail(String code, int status) {
    return new SecurityFailure(code, status);
  }

  public Session login(String customer, String session, String correlation) {
    return run(
        () -> {
          var at = now();
          var s = new Session(session, customer, at, at.plus(timeout), SessionStatus.ACTIVE);
          store.save(s);
          event(customer, session, "LOGIN_SUCCESS", null, correlation, "SUCCESS");
          return s;
        });
  }

  public void loginFailure(String correlation) {
    run(
        () -> {
          event(null, null, "LOGIN_FAILURE", null, correlation, "FAILURE");
          return null;
        });
  }

  public Session session(String customer, String session) {
    return run(() -> active(customer, session));
  }

  private Session active(String customer, String session) {
    var s = store.session(session);
    if (s == null || !s.customerId().equals(customer)) throw fail("UNAUTHENTICATED", 401);
    if (s.status() == SessionStatus.REVOKED) throw fail("SESSION_REVOKED", 401);
    if (s.status() == SessionStatus.EXPIRED || !now().isBefore(s.expiresAt())) {
      store.save(
          new Session(
              s.id(), s.customerId(), s.authenticatedAt(), s.expiresAt(), SessionStatus.EXPIRED));
      store.revoke(s.id());
      throw fail("SESSION_EXPIRED", 401);
    }
    return s;
  }

  public void logout(String customer, String session, String correlation) {
    run(
        () -> {
          var s = active(customer, session);
          store.save(
              new Session(
                  s.id(),
                  s.customerId(),
                  s.authenticatedAt(),
                  s.expiresAt(),
                  SessionStatus.REVOKED));
          store.revoke(session);
          event(customer, session, "LOGOUT", null, correlation, "SUCCESS");
          return null;
        });
  }

  public PhoneBinding phone(String customer) {
    var phone = store.phone(customer);
    if (phone == null || !phone.verified()) throw fail("PHONE_NOT_VERIFIED", 409);
    return phone;
  }

  public boolean demoSmsAvailable() {
    return sms.demoInboxAvailable();
  }

  public boolean smsAvailable() {
    return sms.available();
  }

  public SmsMessage message(String customer, String session, String id) {
    if (!sms.demoInboxAvailable()) throw fail("DEMO_SMS_UNAVAILABLE", 404);
    challenge(customer, session, id);
    var message = store.sms(customer, id);
    if (message == null) throw fail("DEMO_SMS_UNAVAILABLE", 404);
    return message;
  }

  public Challenge create(Binding b, VerificationAction action, String correlation) {
    return run(
        () -> {
          active(b.customerId(), b.sessionId());
          if (action == null
              || !action.resourceType().equals(b.resourceType())
              || !valid(b.resourceId(), 200)
              || !valid(b.resourceHash(), 256)) throw fail("INVALID_REQUEST", 400);
          var requirement = VerificationPolicy.resolve(action);
          if (requirement == VerificationRequirement.NONE) throw fail("INVALID_REQUEST", 400);
          if (requirement.sms() && !sms.available()) throw fail("VERIFICATION_UNAVAILABLE", 503);
          // Repeated clicks return the same still-live challenge and never reset attempts or issue
          // more codes.
          var existing = store.pending(b, action.name());
          if (existing != null && now().isBefore(existing.expiresAt())) return existing;
          var phone = requirement.sms() ? phone(b.customerId()) : null;
          String code = requirement.sms() ? otp.generate() : null;
          if (code != null && !code.matches("[0-9]{6}"))
            throw new IllegalStateException("Invalid OTP generator output");
          var at = now();
          var c =
              new Challenge(
                  id(),
                  b,
                  ChallengeStatus.PENDING,
                  at,
                  at.plusSeconds(300),
                  3,
                  null,
                  action,
                  requirement,
                  code == null ? null : factors.hashOtp(code),
                  phone == null ? null : phone.masked());
          store.save(c);
          event(
              b.customerId(),
              b.sessionId(),
              "STEP_UP_CREATED",
              b.resourceId(),
              correlation,
              "SUCCESS");
          if (code != null) {
            sms.send(b.customerId(), phone.phoneE164(), c.id(), code, at);
            event(
                b.customerId(),
                b.sessionId(),
                "OTP_ISSUED",
                b.resourceId(),
                correlation,
                "SUCCESS");
          }
          return c;
        });
  }

  private boolean valid(String s, int max) {
    return s != null
        && !s.isBlank()
        && s.length() <= max
        && s.chars().noneMatch(Character::isISOControl);
  }

  public Challenge challenge(String customer, String session, String id) {
    return run(() -> owned(customer, session, id));
  }

  private Challenge owned(String customer, String session, String id) {
    active(customer, session);
    var c = store.challenge(id);
    if (c == null
        || c.action() == null
        || !c.binding().customerId().equals(customer)
        || !c.binding().sessionId().equals(session)) throw fail("STEP_UP_CHALLENGE_NOT_FOUND", 404);
    if (c.status() == ChallengeStatus.PENDING && !now().isBefore(c.expiresAt())) {
      c = c.transition(ChallengeStatus.EXPIRED, c.attemptsRemaining(), null);
      store.save(c);
    }
    return c;
  }

  public Verification verify(
      String customer,
      String session,
      String id,
      String code,
      String password,
      String correlation) {
    return run(
        () -> {
          var c = owned(customer, session, id);
          if (c.status() == ChallengeStatus.EXPIRED) throw fail("STEP_UP_CHALLENGE_EXPIRED", 409);
          if (c.status() != ChallengeStatus.PENDING) throw fail("STEP_UP_CHALLENGE_FAILED", 409);
          // Evaluate both required factors, without reporting which factor failed.
          boolean passwordOk =
              !c.requirement().password() || factors.passwordMatches(customer, password);
          boolean otpOk = !c.requirement().sms() || factors.otpMatches(code, c.otpHash());
          if (!(passwordOk & otpOk)) {
            int remaining = c.attemptsRemaining() - 1;
            store.save(
                c.transition(
                    remaining == 0 ? ChallengeStatus.FAILED : ChallengeStatus.PENDING,
                    remaining,
                    null));
            event(
                customer,
                session,
                "STEP_UP_FAILED",
                c.binding().resourceId(),
                correlation,
                "FAILURE");
            throw fail(remaining == 0 ? "STEP_UP_CHALLENGE_FAILED" : "INVALID_VERIFICATION", 422);
          }
          var at = now();
          store.supersede(c.binding());
          var a =
              new Authorization(
                  id(),
                  c.id(),
                  c.binding(),
                  AuthorizationStatus.ACTIVE,
                  at,
                  at.plusSeconds(120),
                  null);
          var verified = c.transition(ChallengeStatus.VERIFIED, c.attemptsRemaining(), a.id());
          store.save(verified);
          store.save(a);
          event(
              customer,
              session,
              "STEP_UP_VERIFIED",
              c.binding().resourceId(),
              correlation,
              "SUCCESS");
          event(
              customer,
              session,
              "AUTHORIZATION_ISSUED",
              c.binding().resourceId(),
              correlation,
              "SUCCESS");
          return new Verification(verified, a);
        });
  }

  public Authorization require(String id, Binding b, VerificationAction action) {
    if (VerificationPolicy.resolve(action) == VerificationRequirement.NONE) return null;
    if (id == null || id.isBlank()) throw fail("STEP_UP_AUTH_REQUIRED", 403);
    return run(
        () -> {
          var a = validated(id, b);
          var c = store.challenge(a.challengeId());
          if (c == null
              || c.action() != action
              || c.requirement() != VerificationPolicy.resolve(action)
              || c.status() != ChallengeStatus.VERIFIED)
            throw fail("ACTION_AUTHORIZATION_MISMATCH", 403);
          return a;
        });
  }

  public Authorization validate(String id, Binding b) {
    return run(() -> validated(id, b));
  }

  private Authorization validated(String id, Binding b) {
    active(b.customerId(), b.sessionId());
    var a = store.authorization(id);
    if (a == null) throw fail("ACTION_AUTHORIZATION_NOT_FOUND", 404);
    if (!a.binding().equals(b)) throw fail("ACTION_AUTHORIZATION_MISMATCH", 403);
    if (a.status() == AuthorizationStatus.CONSUMED)
      throw fail("ACTION_AUTHORIZATION_CONSUMED", 409);
    if (a.status() == AuthorizationStatus.EXPIRED || !now().isBefore(a.expiresAt())) {
      store.save(
          new Authorization(
              a.id(),
              a.challengeId(),
              a.binding(),
              AuthorizationStatus.EXPIRED,
              a.issuedAt(),
              a.expiresAt(),
              null));
      throw fail("ACTION_AUTHORIZATION_EXPIRED", 403);
    }
    if (a.status() != AuthorizationStatus.ACTIVE) throw fail("INSUFFICIENT_AUTH_ASSURANCE", 403);
    return a;
  }

  public Authorization consume(String id, Binding b, String correlation) {
    return run(
        () -> {
          var a = validated(id, b);
          var consumed =
              new Authorization(
                  a.id(),
                  a.challengeId(),
                  b,
                  AuthorizationStatus.CONSUMED,
                  a.issuedAt(),
                  a.expiresAt(),
                  now());
          store.save(consumed);
          event(
              b.customerId(),
              b.sessionId(),
              "AUTHORIZATION_CONSUMED",
              b.resourceId(),
              correlation,
              "SUCCESS");
          return consumed;
        });
  }

  private void event(
      String c, String s, String type, String r, String correlation, String outcome) {
    store.event(c, s, type, r, now(), correlation, outcome);
  }
}
