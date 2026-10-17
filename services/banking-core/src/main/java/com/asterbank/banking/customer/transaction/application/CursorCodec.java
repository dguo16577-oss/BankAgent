package com.asterbank.banking.customer.transaction.application;

import com.asterbank.banking.customer.transaction.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

/** Transport-opaque keyset, bound to customer, normalized filters and repository revision. */
public final class CursorCodec {
  public record Anchor(Instant occurredAt, TransactionId id) {}

  public String scope(CustomerId customer, TransactionFilter q, String revision) {
    try {
      var bytes = new ByteArrayOutputStream();
      var out = new DataOutputStream(bytes);
      for (Object value :
          new Object[] {
            customer.value(),
            revision,
            q.accountId(),
            q.cardId(),
            q.from() == null ? null : q.from().toInstant(),
            q.to() == null ? null : q.to().toInstant(),
            q.status(),
            q.direction(),
            q.type(),
            q.category(),
            q.search(),
            q.limit()
          }) {
        out.writeBoolean(value != null);
        if (value != null) {
          byte[] field = value.toString().getBytes(StandardCharsets.UTF_8);
          out.writeInt(field.length);
          out.write(field);
        }
      }
      return HexFormat.of()
          .formatHex(MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray()));
    } catch (java.security.NoSuchAlgorithmException | IOException impossible) {
      throw new IllegalStateException("Cursor scope unavailable", impossible);
    }
  }

  public String encode(Transaction last, String scope) {
    try {
      var bytes = new ByteArrayOutputStream();
      var out = new DataOutputStream(bytes);
      out.writeByte(1);
      out.writeUTF(scope);
      out.writeUTF(last.occurredAt().toInstant().toString());
      out.writeUTF(last.id().value());
      return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes.toByteArray());
    } catch (IOException impossible) {
      throw new IllegalStateException("Cursor encoding failed", impossible);
    }
  }

  public Anchor decode(String cursor, String scope) {
    try {
      if (cursor.isEmpty() || cursor.length() > 2048 || !cursor.matches("[A-Za-z0-9_-]+"))
        throw new InvalidCursor();
      byte[] bytes = Base64.getUrlDecoder().decode(cursor);
      if (!Base64.getUrlEncoder().withoutPadding().encodeToString(bytes).equals(cursor))
        throw new InvalidCursor();
      var input = new DataInputStream(new ByteArrayInputStream(bytes));
      if (input.readUnsignedByte() != 1 || !input.readUTF().equals(scope))
        throw new InvalidCursor();
      Instant time = Instant.parse(input.readUTF());
      String id = input.readUTF();
      if (id.length() > 256 || input.available() != 0) throw new InvalidCursor();
      return new Anchor(time, new TransactionId(id));
    } catch (IOException | IllegalArgumentException | java.time.DateTimeException exception) {
      throw new InvalidCursor();
    }
  }
}
