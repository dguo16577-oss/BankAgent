package com.asterbank.banking.customer.card.domain;

import java.io.*;
import java.security.*;

/**
 * Ordered, length-prefixed UTF-8 fields. Null differs from empty. No reflection or JSON hashing.
 */
public final class CardIntentHasher {
  public String hash(CardIntentTerms t) {
    var c = new Canonical();
    c.add("CARD_ACTION_INTENT_V1");
    c.add(t.id());
    var card = t.card();
    c.add(card.customerId().value());
    c.add(card.id());
    c.add(card.displayName());
    c.add(card.maskedNumber());
    c.add(card.scheme().name());
    c.add(card.type().name());
    c.add(card.linkedAccount().id());
    c.add(card.linkedAccount().displayName());
    c.add(card.linkedAccount().maskedAccountNumber());
    c.state(card.state());
    c.add(card.updatedAt().toInstant().toString());
    c.add(t.actionType().name());
    c.state(t.change().before());
    c.state(t.change().after());
    if (t.actionType() == CardActionType.UPDATE_LIMITS) {
      c.add(t.change().before().limits().perTransaction().toPlainString());
      c.add(t.change().before().limits().daily().toPlainString());
      c.add(t.change().after().limits().perTransaction().toPlainString());
      c.add(t.change().after().limits().daily().toPlainString());
      c.add(t.change().after().limits().bankMaxPerTransaction().toPlainString());
      c.add(t.change().after().limits().bankMaxDaily().toPlainString());
    }
    c.add(t.change().risk().name());
    c.add(t.change().authorization().name());
    c.add(t.createdAt().toInstant().toString());
    c.add(t.expiresAt().toInstant().toString());
    return c.digest();
  }

  public String fingerprint(String intent, String hash, String authorization) {
    var c = new Canonical();
    c.add("EXECUTE_CARD_ACTION_V1");
    c.add(intent);
    c.add(hash);
    c.add(authorization);
    return c.digest();
  }

  private static final class Canonical {
    private final com.asterbank.banking.shared.domain.CanonicalHash fields =
        new com.asterbank.banking.shared.domain.CanonicalHash();

    void add(String v) {
      fields.add(v);
    }

    void state(Card.State s) {
      add(s.status().name());
      add(Integer.toString(s.version()));
      add(Boolean.toString(s.controls().onlinePayments()));
      add(Boolean.toString(s.controls().internationalPayments()));
      add(Boolean.toString(s.controls().atmWithdrawals()));
      add(Boolean.toString(s.controls().contactless()));
    }

    String digest() {
      return fields.digest();
    }
  }
}
