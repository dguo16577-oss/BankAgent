package com.asterbank.banking.customer.payment.domain;

import com.asterbank.banking.shared.domain.CustomerId;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.HexFormat;

public record RecipientAction(
    String id,
    CustomerId owner,
    String sessionId,
    Type type,
    Recipient recipient,
    OffsetDateTime createdAt,
    OffsetDateTime expiresAt,
    String hash) {
  public enum Type {
    CREATE,
    DEACTIVATE
  }

  public static String digest(String... fields) {
    try {
      var bytes = new java.io.ByteArrayOutputStream();
      var out = new java.io.DataOutputStream(bytes);
      for (String field : fields) {
        if (field == null) out.writeInt(-1);
        else {
          var value = field.getBytes(StandardCharsets.UTF_8);
          out.writeInt(value.length);
          out.write(value);
        }
      }
      return HexFormat.of()
          .formatHex(MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray()));
    } catch (java.io.IOException | java.security.NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  public static RecipientAction prepare(
      String id, CustomerId owner, String session, Type type, Recipient r, OffsetDateTime at) {
    var expiry = at.plusMinutes(15);
    var hash =
        digest(
            "RECIPIENT_ACTION_V1",
            id,
            owner.value(),
            session,
            type.name(),
            r.id().value(),
            r.destinationRef(),
            r.displayName(),
            r.bankName(),
            r.maskedAccountNumber(),
            r.currency().getCurrencyCode(),
            r.status().name(),
            Integer.toString(r.version()),
            at.toString(),
            expiry.toString(),
            "CONFIRMATION");
    return new RecipientAction(id, owner, session, type, r, at, expiry, hash);
  }
}
