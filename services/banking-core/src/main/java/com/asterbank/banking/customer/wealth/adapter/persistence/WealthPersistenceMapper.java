package com.asterbank.banking.customer.wealth.adapter.persistence;

import com.asterbank.banking.customer.wealth.domain.*;
import tools.jackson.databind.ObjectMapper;

public final class WealthPersistenceMapper {
  public record IntentDocument(int version, InvestmentIntent.Terms terms) {}

  public record OrderDocument(int version, InvestmentOrder order) {}

  public record RedemptionIntentDocument(int version, RedemptionIntent.Terms terms) {}

  public record RedemptionOrderDocument(int version, RedemptionOrder order) {}

  private final ObjectMapper mapper;

  public WealthPersistenceMapper(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  public String intent(InvestmentIntent.Terms t) {
    return mapper.writeValueAsString(new IntentDocument(1, t));
  }

  public InvestmentIntent.Terms intent(String s) {
    var d = mapper.readValue(s, IntentDocument.class);
    if (d.version() != 1) throw new IllegalStateException("Unknown investment snapshot");
    return d.terms();
  }

  public String order(InvestmentOrder o) {
    return mapper.writeValueAsString(new OrderDocument(1, o));
  }

  public InvestmentOrder order(String s) {
    var d = mapper.readValue(s, OrderDocument.class);
    if (d.version() != 1) throw new IllegalStateException("Unknown order snapshot");
    return d.order();
  }

  public String redemptionIntent(RedemptionIntent.Terms t) {
    return mapper.writeValueAsString(new RedemptionIntentDocument(1, t));
  }

  public RedemptionIntent.Terms redemptionIntent(String s) {
    var d = mapper.readValue(s, RedemptionIntentDocument.class);
    if (d.version() != 1) throw new IllegalStateException("Unknown redemption snapshot");
    return d.terms();
  }

  public String redemptionOrder(RedemptionOrder o) {
    return mapper.writeValueAsString(new RedemptionOrderDocument(1, o));
  }

  public RedemptionOrder redemptionOrder(String s) {
    var d = mapper.readValue(s, RedemptionOrderDocument.class);
    if (d.version() != 1) throw new IllegalStateException("Unknown redemption receipt");
    return d.order();
  }

  public String reasons(java.util.List<String> reasons) {
    return mapper.writeValueAsString(reasons);
  }

  public java.util.List<String> reasons(String s) {
    return java.util.List.of(mapper.readValue(s, String[].class));
  }
}
