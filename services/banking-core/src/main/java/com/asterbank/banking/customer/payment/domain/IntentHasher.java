package com.asterbank.banking.customer.payment.domain;

import com.asterbank.banking.customer.account.domain.Account;
import com.asterbank.banking.shared.domain.Money;
import java.io.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.HexFormat;

/** Versioned length-prefixed canonical fields, independent of JSON DTO ordering. */
public final class IntentHasher {
  public static String canonicalAmount(BigDecimal value) {
    return value.signum() == 0 ? "0" : value.stripTrailingZeros().toPlainString();
  }

  public String hash(IntentTerms t) {
    var c = new Canonical();
    c.add("TRANSFER_INTENT_V1");
    c.add(t.id());
    c.add(t.customerId().value());
    Account a = t.sourceAccount();
    c.add(a.id().value());
    c.add(a.customerId().value());
    c.add(a.displayName());
    c.add(a.type().name());
    c.add(a.status().name());
    c.money(a.balance());
    c.money(a.pendingAmount());
    c.money(a.availableBalance());
    c.add(a.maskedAccountNumber());
    if (a.equivalent() == null) c.add(null);
    else {
      var e = a.equivalent();
      c.money(e.value());
      c.add(e.sourceCurrency().getCurrencyCode());
      c.add(canonicalAmount(e.exchangeRate()));
      c.add(e.conversionAsOf().toString());
      c.add("DEMO_RATE");
    }
    var r = t.recipient();
    c.add(r.id().value());
    c.add(r.customerId().value());
    c.add(r.displayName());
    c.add(r.bankName());
    c.add(r.maskedAccountNumber());
    c.add(r.currency().getCurrencyCode());
    c.money(t.amount());
    c.money(t.fee());
    c.money(t.totalDebit());
    c.money(t.projectedAvailableBalance());
    c.add(t.note());
    c.add(t.createdAt().toString());
    c.add(t.expiresAt().toString());
    if (t.sessionId() != null) {
      c.add("PAYMENT_CONTEXT_V2");
      c.add(t.sessionId());
      c.add(t.authorizationRequirement());
      c.add(t.policyVersion());
      c.add(r.destinationRef());
      c.add(r.status().name());
      c.add(Integer.toString(r.version()));
    }
    return c.digest();
  }

  public String requestFingerprint(String intentId, String hash) {
    var c = new Canonical();
    c.add("EXECUTE_TRANSFER_V1");
    c.add(intentId);
    c.add(hash);
    return c.digest();
  }

  private static final class Canonical {
    final ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    final DataOutputStream out = new DataOutputStream(buffer);

    void add(String value) {
      try {
        if (value == null) {
          out.writeInt(-1);
          return;
        }
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        out.writeInt(bytes.length);
        out.write(bytes);
      } catch (IOException e) {
        throw new UncheckedIOException(e);
      }
    }

    void money(Money m) {
      add(canonicalAmount(m.amount()));
      add(m.currency().getCurrencyCode());
    }

    String digest() {
      try {
        return HexFormat.of()
            .formatHex(MessageDigest.getInstance("SHA-256").digest(buffer.toByteArray()));
      } catch (NoSuchAlgorithmException e) {
        throw new IllegalStateException(e);
      }
    }
  }
}
