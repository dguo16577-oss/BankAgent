package com.asterbank.banking.security.adapter.persistence;

import com.asterbank.banking.security.application.SecurityStore;
import com.asterbank.banking.security.domain.*;
import com.asterbank.banking.security.domain.SecurityState.*;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.jdbc.core.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

public final class JdbcSecurityStore implements SecurityStore {
  private final JdbcTemplate db;
  private final TransactionTemplate tx;

  public JdbcSecurityStore(JdbcTemplate db, PlatformTransactionManager manager) {
    this.db = db;
    tx = new TransactionTemplate(manager);
  }

  public <T> T transaction(Supplier<T> work) {
    return tx.execute(s -> work.get());
  }

  private <T> T one(String sql, RowMapper<T> mapper, Object... args) {
    var rows = db.query(sql, mapper, args);
    return rows.isEmpty() ? null : rows.getFirst();
  }

  private static Timestamp ts(Instant i) {
    return i == null ? null : Timestamp.from(i);
  }

  private static Instant instant(ResultSet r, String c) throws SQLException {
    var t = r.getTimestamp(c);
    return t == null ? null : t.toInstant();
  }

  private static Binding binding(ResultSet r) throws SQLException {
    return new Binding(
        r.getString("customer_id"),
        r.getString("session_id"),
        r.getString("resource_type"),
        r.getString("resource_id"),
        r.getString("resource_hash"));
  }

  public PhoneBinding phone(String customer) {
    return one(
        "select phone_e164,status from customer_phone_bindings where customer_id=?",
        (r, n) -> new PhoneBinding(r.getString(1), r.getString(2).equals("VERIFIED")),
        customer);
  }

  public SmsMessage sms(String customer, String challenge) {
    return one(
        "select * from demo_sms_outbox where customer_id=? and challenge_id=?",
        (r, n) ->
            new SmsMessage(
                r.getString("message_id"),
                challenge,
                new PhoneBinding(r.getString("phone_e164"), true).masked(),
                r.getString("message_body"),
                instant(r, "created_at")),
        customer,
        challenge);
  }

  public Challenge pending(Binding b, String action) {
    String id =
        one(
            "select challenge_id from step_up_challenges where customer_id=? and session_id=? and resource_type=? and resource_id=? and resource_hash=? and action_type=? and status='PENDING' order by created_at desc limit 1",
            (r, n) -> r.getString(1),
            b.customerId(),
            b.sessionId(),
            b.resourceType(),
            b.resourceId(),
            b.resourceHash(),
            action);
    return id == null ? null : challenge(id);
  }

  public Session session(String id) {
    return one(
        "select * from security_sessions where session_id=? for update",
        (r, n) ->
            new Session(
                r.getString("session_id"),
                r.getString("customer_id"),
                instant(r, "authenticated_at"),
                instant(r, "expires_at"),
                SessionStatus.valueOf(r.getString("status"))),
        id);
  }

  public void save(Session s) {
    db.update(
        "insert into security_sessions values(?,?,?,?,?) on conflict(session_id) do update set status=excluded.status",
        s.id(),
        s.customerId(),
        ts(s.authenticatedAt()),
        ts(s.expiresAt()),
        s.status().name());
  }

  public Challenge challenge(String id) {
    return one(
        "select c.*,a.authorization_id from step_up_challenges c left join action_authorizations a using(challenge_id) where c.challenge_id=? for update of c",
        (r, n) ->
            new Challenge(
                r.getString("challenge_id"),
                binding(r),
                ChallengeStatus.valueOf(r.getString("status")),
                instant(r, "created_at"),
                instant(r, "expires_at"),
                r.getInt("attempts_remaining"),
                r.getString("authorization_id"),
                r.getString("action_type").equals("LEGACY")
                    ? null
                    : VerificationAction.valueOf(r.getString("action_type")),
                VerificationRequirement.valueOf(r.getString("verification_requirement")),
                r.getString("otp_hash"),
                r.getString("masked_phone")),
        id);
  }

  public void save(Challenge c) {
    var b = c.binding();
    db.update(
        "insert into step_up_challenges(challenge_id,customer_id,session_id,resource_type,resource_id,resource_hash,status,created_at,expires_at,attempts_remaining,action_type,verification_requirement,otp_hash,masked_phone) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?) on conflict(challenge_id) do update set status=excluded.status,attempts_remaining=excluded.attempts_remaining",
        c.id(),
        b.customerId(),
        b.sessionId(),
        b.resourceType(),
        b.resourceId(),
        b.resourceHash(),
        c.status().name(),
        ts(c.createdAt()),
        ts(c.expiresAt()),
        c.attemptsRemaining(),
        c.action() == null ? "LEGACY" : c.action().name(),
        c.requirement().name(),
        c.otpHash(),
        c.maskedPhone());
  }

  public Authorization authorization(String id) {
    return one(
        "select * from action_authorizations where authorization_id=? for update",
        (r, n) ->
            new Authorization(
                r.getString("authorization_id"),
                r.getString("challenge_id"),
                binding(r),
                AuthorizationStatus.valueOf(r.getString("status")),
                instant(r, "issued_at"),
                instant(r, "expires_at"),
                instant(r, "consumed_at")),
        id);
  }

  public void save(Authorization a) {
    var b = a.binding();
    db.update(
        "insert into action_authorizations values(?,?,?,?,?,?,?,'AAL2',?,?,?,?) on conflict(authorization_id) do update set status=excluded.status,consumed_at=excluded.consumed_at",
        a.id(),
        a.challengeId(),
        b.customerId(),
        b.sessionId(),
        b.resourceType(),
        b.resourceId(),
        b.resourceHash(),
        a.status().name(),
        ts(a.issuedAt()),
        ts(a.expiresAt()),
        ts(a.consumedAt()));
  }

  public void revoke(String session) {
    db.update(
        "update step_up_challenges set status='CANCELLED' where session_id=? and status='PENDING'",
        session);
    db.update(
        "update action_authorizations set status='REVOKED' where session_id=? and status='ACTIVE'",
        session);
  }

  public void supersede(Binding b) {
    db.update(
        "update action_authorizations set status='REVOKED' where session_id=? and resource_type=? and resource_id=? and resource_hash=? and status='ACTIVE'",
        b.sessionId(),
        b.resourceType(),
        b.resourceId(),
        b.resourceHash());
  }

  public void event(
      String c, String s, String t, String r, Instant at, String correlation, String outcome) {
    db.update(
        "insert into security_events values(?,?,?,?,?,?,?,?)",
        UUID.randomUUID().toString(),
        c,
        s,
        t,
        r,
        ts(at),
        correlation,
        outcome);
  }
}
