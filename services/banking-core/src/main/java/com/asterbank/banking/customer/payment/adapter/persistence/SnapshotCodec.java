package com.asterbank.banking.customer.payment.adapter.persistence;

import com.asterbank.banking.customer.payment.domain.*;
import tools.jackson.databind.ObjectMapper;

/** Version 1 JSON storage documents; never Java serialization or generated HTTP DTOs. */
public final class SnapshotCodec {
  public record IntentDocument(int version, IntentTerms terms) {}

  public record ReceiptDocument(int version, Transfer receipt) {}

  private final ObjectMapper mapper;

  public SnapshotCodec(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  public String intent(IntentTerms t) {
    return mapper.writeValueAsString(new IntentDocument(1, t));
  }

  public IntentTerms intent(String json) {
    var doc = mapper.readValue(json, IntentDocument.class);
    if (doc.version() != 1) throw new IllegalStateException("Unsupported intent snapshot version");
    return doc.terms();
  }

  public String transfer(Transfer t) {
    return mapper.writeValueAsString(new ReceiptDocument(1, t));
  }

  public Transfer transfer(String json) {
    var doc = mapper.readValue(json, ReceiptDocument.class);
    if (doc.version() != 1) throw new IllegalStateException("Unsupported receipt snapshot version");
    return doc.receipt();
  }
}
