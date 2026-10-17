package com.asterbank.banking.customer.payment.adapter.persistence;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.OffsetDateTime;
import java.util.Objects;

@Entity
@Table(name = "idempotency_records")
@IdClass(IdempotencyJpaEntity.Key.class)
public class IdempotencyJpaEntity {
  @Id
  @Column(name = "customer_id")
  public String customerId;

  @Id
  @Column(name = "operation")
  public String operation;

  @Id
  @Column(name = "idempotency_key")
  public String idempotencyKey;

  @Column(name = "fingerprint")
  public String fingerprint;

  @Column(name = "status")
  public String status;

  @Column(name = "transfer_id")
  public String transferId;

  @Column(name = "card_action_id")
  public String cardActionId;

  @Column(name = "created_at")
  public OffsetDateTime createdAt;

  @Column(name = "completed_at")
  public OffsetDateTime completedAt;

  public static class Key implements Serializable {
    public String customerId;
    public String operation;
    public String idempotencyKey;

    public Key() {}

    public boolean equals(Object other) {
      return other instanceof Key k
          && Objects.equals(customerId, k.customerId)
          && Objects.equals(operation, k.operation)
          && Objects.equals(idempotencyKey, k.idempotencyKey);
    }

    public int hashCode() {
      return Objects.hash(customerId, operation, idempotencyKey);
    }
  }
}
