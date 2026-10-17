package com.asterbank.banking.customer.card.adapter.persistence;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "card_action_intents")
public class CardActionIntentJpaEntity {
  @Id
  @Column(name = "intent_id")
  public String intentId;

  @Column(name = "customer_id")
  public String customerId;

  @Column(name = "card_id")
  public String cardId;

  @Column(name = "action_type")
  public String actionType;

  @Column(name = "status")
  public String status;

  @Column(name = "intent_hash")
  public String intentHash;

  @Column(name = "risk_direction")
  public String riskDirection;

  @Column(name = "authorization_requirement")
  public String authorizationRequirement;

  @Column(name = "before_version")
  public int beforeVersion;

  @Column(name = "after_version")
  public int afterVersion;

  @Column(name = "created_at")
  public OffsetDateTime createdAt;

  @Column(name = "expires_at")
  public OffsetDateTime expiresAt;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "snapshot", columnDefinition = "jsonb")
  public String snapshot;
}
