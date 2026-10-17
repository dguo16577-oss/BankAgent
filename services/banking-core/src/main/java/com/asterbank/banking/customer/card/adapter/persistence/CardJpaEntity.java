package com.asterbank.banking.customer.card.adapter.persistence;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "cards")
public class CardJpaEntity {
  @Id
  @Column(name = "card_id")
  public String cardId;

  @Column(name = "customer_id")
  public String customerId;

  @Column(name = "display_name")
  public String displayName;

  @Column(name = "masked_number")
  public String maskedNumber;

  @Column(name = "scheme")
  public String scheme;

  @Column(name = "card_type")
  public String cardType;

  @Column(name = "status")
  public String status;

  @Column(name = "linked_account_id")
  public String linkedAccountId;

  @Column(name = "linked_account_name")
  public String linkedAccountName;

  @Column(name = "linked_account_masked_number")
  public String linkedAccountMaskedNumber;

  @Column(name = "online_payments")
  public boolean onlinePayments;

  @Column(name = "international_payments")
  public boolean internationalPayments;

  @Column(name = "atm_withdrawals")
  public boolean atmWithdrawals;

  @Column(name = "contactless")
  public boolean contactless;

  @Column(name = "per_transaction_limit")
  public BigDecimal perTransactionLimit;

  @Column(name = "daily_limit")
  public BigDecimal dailyLimit;

  @Column(name = "bank_max_per_transaction")
  public BigDecimal bankMaxPerTransaction;

  @Column(name = "bank_max_daily")
  public BigDecimal bankMaxDaily;

  @Column(name = "credit_limit")
  public BigDecimal creditLimit;

  @Column(name = "business_version")
  public int businessVersion;

  @Version
  @Column(name = "row_version")
  public long rowVersion;

  @Column(name = "display_order")
  public int displayOrder;

  @Column(name = "updated_at")
  public OffsetDateTime updatedAt;
}
