package com.asterbank.banking.customer.card.adapter.persistence;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "card_actions")
public class CardActionJpaEntity {
  @Id
  @Column(name = "action_id")
  public String actionId;

  @Column(name = "customer_id")
  public String customerId;

  @Column(name = "card_id")
  public String cardId;

  @Column(name = "intent_id")
  public String intentId;

  @Column(name = "status")
  public String status;

  @Column(name = "reference")
  public String reference;

  @Column(name = "completed_at")
  public OffsetDateTime completedAt;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "snapshot", columnDefinition = "jsonb")
  public String snapshot;
}
