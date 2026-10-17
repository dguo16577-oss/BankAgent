package com.asterbank.banking.customer.payment.adapter.persistence;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "recipient_action_intents")
public class RecipientIntentJpaEntity {
  @Id
  @Column(name = "intent_id")
  public String id;

  @Column(name = "customer_id")
  public String owner;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb")
  public String snapshot;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb")
  public String result;

  @Column(name = "created_at")
  public java.time.OffsetDateTime createdAt;
}
