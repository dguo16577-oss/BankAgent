package com.asterbank.banking.customer.payment.adapter.persistence;

import jakarta.persistence.*;

@Entity
@Table(name = "recipients")
public class RecipientJpaEntity {
  @Id
  @Column(name = "recipient_id")
  public String recipientId;

  @Column(name = "customer_id")
  public String customerId;

  @Column(name = "display_name")
  public String displayName;

  @Column(name = "bank_name")
  public String bankName;

  @Column(name = "masked_identifier")
  public String maskedIdentifier;

  @Column(name = "currency")
  public String currency;

  @Column(name = "destination_ref")
  public String destinationRef;

  @Column(name = "status")
  public String status;

  @Column(name = "created_at")
  public java.time.OffsetDateTime createdAt;

  @Column(name = "version")
  public int version;

  @Column(name = "phone_e164")
  public String phoneE164;
}
