package com.asterbank.banking.customer.wealth.domain;

import com.asterbank.banking.shared.domain.*;
import java.time.OffsetDateTime;

/** Explicit, ordered, length-prefixed review hash; independent of JSON/property order. */
public final class InvestmentIntentHasher {
  private String time(OffsetDateTime t) {
    return t == null ? null : t.toInstant().toString();
  }

  private void money(CanonicalHash h, Money m) {
    h.add(m.decimal()).add(m.currency().getCurrencyCode());
  }

  public String hash(InvestmentIntent.Terms t) {
    var h =
        new CanonicalHash()
            .add("INVESTMENT_ORDER_INTENT_V1")
            .add(t.id())
            .add("CONFIRMATION")
            .add("SIMULATED");
    var p = t.product();
    h.add(p.id())
        .add(p.displayName())
        .add(p.type().name())
        .add(p.riskLevel().name())
        .add(p.status().name())
        .add(Integer.toString(p.version()));
    money(h, p.minimumInvestment());
    money(h, p.fees());
    h.add(p.indicativeYield())
        .add(p.performanceSummary())
        .add(p.liquidity())
        .add(p.description())
        .add(p.disclaimer());
    var a = t.sourceAccount();
    h.add(a.customerId().value())
        .add(a.id().value())
        .add(a.displayName())
        .add(a.type().name())
        .add(a.status().name())
        .add(a.maskedAccountNumber())
        .add(time(a.openedAt()));
    money(h, a.balance());
    money(h, a.pendingAmount());
    money(h, a.availableBalance());
    var e = a.equivalent();
    h.add(e == null ? "ABSENT" : "PRESENT");
    if (e != null) {
      money(h, e.value());
      h.add(e.sourceCurrency().getCurrencyCode())
          .add(e.exchangeRate().stripTrailingZeros().toPlainString())
          .add(time(e.conversionAsOf()))
          .add("DEMO_RATE");
    }
    var s = t.suitability();
    h.add(s.id())
        .add(s.customerId().value())
        .add(s.productId())
        .add(s.userRiskLevel().name())
        .add(s.productRiskLevel().name())
        .add(Integer.toString(s.productVersion()))
        .add(Integer.toString(s.riskProfileVersion()))
        .add(s.result().name())
        .add(Integer.toString(s.reasons().size()));
    s.reasons().forEach(h::add);
    h.add(time(s.createdAt())).add(time(s.expiresAt()));
    money(h, t.amount());
    money(h, t.fees());
    money(h, t.totalDebit());
    money(h, t.projectedAvailableBalance());
    return h.add(time(t.createdAt())).add(time(t.expiresAt())).digest();
  }

  public String fingerprint(String id, String hash) {
    return new CanonicalHash().add("EXECUTE_INVESTMENT_ORDER_V1").add(id).add(hash).digest();
  }
}
