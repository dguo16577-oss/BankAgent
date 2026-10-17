package com.asterbank.banking.shared.domain;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.HexFormat;

/** Versioned callers supply ordered fields; null and empty remain distinct. */
public final class CanonicalHash {
  private final ByteArrayOutputStream buffer = new ByteArrayOutputStream();
  private final DataOutputStream out = new DataOutputStream(buffer);

  public CanonicalHash add(String v) {
    try {
      if (v == null) out.writeInt(-1);
      else {
        var b = v.getBytes(StandardCharsets.UTF_8);
        out.writeInt(b.length);
        out.write(b);
      }
      return this;
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  public String digest() {
    try {
      return HexFormat.of()
          .formatHex(MessageDigest.getInstance("SHA-256").digest(buffer.toByteArray()));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
