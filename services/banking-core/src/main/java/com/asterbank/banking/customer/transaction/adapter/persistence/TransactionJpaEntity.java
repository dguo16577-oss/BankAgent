package com.asterbank.banking.customer.transaction.adapter.persistence;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "transactions")
public class TransactionJpaEntity {
  @Id
  @Column(name = "transaction_id")
  public String transactionId;

  @Column(name = "customer_id")
  public String customerId;

  @Column(name = "account_id")
  public String accountId;

  @Column(name = "card_id")
  public String cardId;

  @Column(name = "card_masked_number")
  public String cardMaskedNumber;

  @Column(name = "title")
  public String title;

  @Column(name = "amount", precision = 24, scale = 2)
  public BigDecimal amount;

  @Column(name = "currency")
  public String currency;

  @Column(name = "direction")
  public String direction;

  @Column(name = "status")
  public String status;

  @Column(name = "type")
  public String type;

  @Column(name = "category")
  public String category;

  @Column(name = "occurred_at")
  public OffsetDateTime occurredAt;

  @Column(name = "booked_at")
  public OffsetDateTime bookedAt;

  @Column(name = "merchant_id")
  public String merchantId;

  @Column(name = "merchant_name")
  public String merchantName;

  @Column(name = "merchant_masked_number")
  public String merchantMaskedNumber;

  @Column(name = "merchant_location")
  public String merchantLocation;

  @Column(name = "counterparty_name")
  public String counterpartyName;

  @Column(name = "counterparty_masked_number")
  public String counterpartyMaskedNumber;

  @Column(name = "reference")
  public String reference;

  @Column(name = "note")
  public String note;

  @Column(name = "note_search")
  public String noteSearch;

  @Column(name = "title_search")
  public String titleSearch;

  @Column(name = "merchant_search")
  public String merchantSearch;

  @Column(name = "counterparty_search")
  public String counterpartySearch;
}
