package com.asterbank.banking.customer.recurring.adapter.persistence;

import com.asterbank.banking.customer.recurring.domain.*;
import tools.jackson.databind.ObjectMapper;

public final class RecurringPersistenceMapper {
  public record IntentDocument(int version, RecurringIntent.Terms terms) {}

  public record ActionDocument(int version, RecurringAction action) {}

  private final ObjectMapper mapper;

  public RecurringPersistenceMapper(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  public String intent(RecurringIntent.Terms t) {
    return mapper.writeValueAsString(new IntentDocument(1, t));
  }

  public RecurringIntent.Terms intent(String s) {
    var d = mapper.readValue(s, IntentDocument.class);
    if (d.version() != 1) throw new IllegalStateException("Unknown recurring snapshot");
    return d.terms();
  }

  public String action(RecurringAction a) {
    return mapper.writeValueAsString(new ActionDocument(1, a));
  }

  public RecurringAction action(String s) {
    var d = mapper.readValue(s, ActionDocument.class);
    if (d.version() != 1) throw new IllegalStateException("Unknown recurring snapshot");
    return d.action();
  }
}
