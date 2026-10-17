package com.asterbank.banking.shared.adapter.persistence;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "customers")
public class CustomerJpaEntity {
  @Id
  @Column(name = "customer_id")
  public String customerId;

  @Column(name = "display_name")
  public String displayName;

  @Column(name = "created_at")
  public OffsetDateTime createdAt;

  @Column(name = "account_as_of")
  public OffsetDateTime accountAsOf;

  @Column(name = "transaction_revision")
  public long transactionRevision;

  @Column(name = "seed_version")
  public int seedVersion;
}
