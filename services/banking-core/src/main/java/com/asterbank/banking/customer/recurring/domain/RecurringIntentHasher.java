package com.asterbank.banking.customer.recurring.domain;

import com.asterbank.banking.shared.domain.CanonicalHash;
import java.time.OffsetDateTime;

public final class RecurringIntentHasher {
  private String time(OffsetDateTime t) {
    return t == null ? null : t.toInstant().toString();
  }

  public String hash(RecurringIntent.Terms t) {
    var c = new CanonicalHash();
    var p = t.payment();
    c.add("RECURRING_ACTION_INTENT_V1")
        .add(t.id())
        .add("STOP_FUTURE_PAYMENTS")
        .add("PROTECTIVE")
        .add("CONFIRMATION");
    c.add(p.customerId().value())
        .add(p.id())
        .add(p.displayName())
        .add(p.type().name())
        .add(p.frequency().name())
        .add(p.source().name())
        .add(p.sourceAccountId())
        .add(p.cardId());
    var m = p.merchant();
    c.add(m == null ? "ABSENT" : "PRESENT");
    if (m != null) c.add(m.id()).add(m.name()).add(m.location()).add(m.maskedCardNumber());
    c.add(p.usualAmount().decimal())
        .add(p.usualAmount().currency().getCurrencyCode())
        .add(time(p.lastPaidAt()));
    state(c, p.state());
    state(c, t.after());
    c.add(Integer.toString(p.transactionHistory().size()));
    p.transactionHistory().forEach(c::add);
    var d = p.detectionProvenance();
    c.add(d == null ? "ABSENT" : "PRESENT");
    if (d != null) {
      c.add(Integer.toString(d.observedOccurrences()))
          .add(time(d.firstObservedAt()))
          .add(time(d.lastObservedAt()));
      d.matchedTransactionIds().forEach(c::add);
    }
    c.add(t.effectDescription()).add(time(t.createdAt())).add(time(t.expiresAt()));
    return c.digest();
  }

  private void state(CanonicalHash c, RecurringPayment.State s) {
    c.add(s.status().name())
        .add(time(s.nextExpectedAt()))
        .add(s.managementCapability().name())
        .add(Integer.toString(s.version()));
  }

  public String fingerprint(String id, String hash) {
    return new CanonicalHash()
        .add("EXECUTE_RECURRING_PAYMENT_ACTION_V1")
        .add(id)
        .add(hash)
        .digest();
  }
}
