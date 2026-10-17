package com.asterbank.banking.customer.payment.adapter.persistence;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "transfers")
public class TransferJpaEntity {
  @Id
  @Column(name = "transfer_id")
  public String transferId;

  @Column(name = "customer_id")
  public String customerId;

  @Column(name = "intent_id")
  public String intentId;

  @Column(name = "source_account_id")
  public String sourceAccountId;

  @Column(name = "recipient_id")
  public String recipientId;

  @Column(name = "amount", precision = 24, scale = 2)
  public BigDecimal amount;

  @Column(name = "fee", precision = 24, scale = 2)
  public BigDecimal fee;

  @Column(name = "total_debit", precision = 24, scale = 2)
  public BigDecimal totalDebit;

  @Column(name = "currency")
  public String currency;

  @Column(name = "status")
  public String status;

  @Column(name = "transaction_id")
  public String transactionId;

  @Column(name = "reference")
  public String reference;

  @Column(name = "created_at")
  public OffsetDateTime createdAt;

  @Column(name = "completed_at")
  public OffsetDateTime completedAt;

  @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
  @Column(name = "snapshot", columnDefinition = "jsonb")
  public String snapshot;
}
