package com.asterbank.banking.customer.wealth.domain;

import com.asterbank.banking.shared.domain.CanonicalHash;

public final class RedemptionIntentHasher {
  public String hash(RedemptionIntent.Terms t) {
    var p = t.product();
    var h = t.holding();
    var a = t.destinationAccount();
    var r = t.riskProfile();
    return new CanonicalHash()
        .add("INVESTMENT_REDEMPTION_INTENT_V1")
        .add(t.id())
        .add(h.customerId().value())
        .add(p.id())
        .add(p.status().name())
        .add(Integer.toString(p.version()))
        .add(p.riskLevel().name())
        .add(p.liquidity())
        .add(p.description())
        .add(p.disclaimer())
        .add(h.id())
        .add(Integer.toString(h.version()))
        .add(h.currentValue().decimal())
        .add(h.investedAmount().decimal())
        .add(a.id().value())
        .add(a.status().name())
        .add(a.balance().decimal())
        .add(r.riskLevel().name())
        .add(Integer.toString(r.version()))
        .add(r.expiresAt().toInstant().toString())
        .add(t.amount().decimal())
        .add(t.fees().decimal())
        .add(t.estimatedProceeds().decimal())
        .add(t.createdAt().toInstant().toString())
        .add(t.expiresAt().toInstant().toString())
        .digest();
  }

  public String fingerprint(String id, String hash) {
    return new CanonicalHash().add("EXECUTE_INVESTMENT_REDEMPTION_V1").add(id).add(hash).digest();
  }
}
