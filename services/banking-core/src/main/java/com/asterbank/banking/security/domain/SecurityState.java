package com.asterbank.banking.security.domain;

import java.time.Instant;

public final class SecurityState {
  private SecurityState() {}

  public enum SessionStatus {
    ACTIVE,
    EXPIRED,
    REVOKED
  }

  public enum ChallengeStatus {
    PENDING,
    VERIFIED,
    FAILED,
    EXPIRED,
    CANCELLED
  }

  public enum AuthorizationStatus {
    ACTIVE,
    CONSUMED,
    EXPIRED,
    REVOKED
  }

  public record Binding(
      String customerId,
      String sessionId,
      String resourceType,
      String resourceId,
      String resourceHash) {}

  public record Session(
      String id,
      String customerId,
      Instant authenticatedAt,
      Instant expiresAt,
      SessionStatus status) {}

  public record Challenge(
      String id,
      Binding binding,
      ChallengeStatus status,
      Instant createdAt,
      Instant expiresAt,
      int attemptsRemaining,
      String authorizationId,
      VerificationAction action,
      VerificationRequirement requirement,
      String otpHash,
      String maskedPhone) {
    public Challenge transition(ChallengeStatus next, int remaining, String authorization) {
      return new Challenge(
          id,
          binding,
          next,
          createdAt,
          expiresAt,
          remaining,
          authorization,
          action,
          requirement,
          otpHash,
          maskedPhone);
    }
  }

  public record PhoneBinding(String phoneE164, boolean verified) {
    public String masked() {
      return phoneE164.substring(0, Math.min(6, phoneE164.length() - 4))
          + "****"
          + phoneE164.substring(phoneE164.length() - 4);
    }
  }

  public record SmsMessage(
      String id, String challengeId, String maskedPhone, String messageBody, Instant createdAt) {}

  public record Authorization(
      String id,
      String challengeId,
      Binding binding,
      AuthorizationStatus status,
      Instant issuedAt,
      Instant expiresAt,
      Instant consumedAt) {}

  public record Verification(Challenge challenge, Authorization authorization) {}
}
