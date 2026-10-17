package com.asterbank.banking.customer.account.adapter.persistence;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "accounts")
public class AccountJpaEntity {
  @Id
  @Column(name = "account_id")
  public String accountId;

  @Column(name = "customer_id")
  public String customerId;

  @Column(name = "display_name")
  public String displayName;

  @Column(name = "account_type")
  public String accountType;

  @Column(name = "status")
  public String status;

  @Column(name = "currency")
  public String currency;

  @Column(name = "balance", precision = 24, scale = 2)
  public BigDecimal balance;

  @Column(name = "pending_amount", precision = 24, scale = 2)
  public BigDecimal pendingAmount;

  @Column(name = "masked_identifier")
  public String maskedIdentifier;

  @Column(name = "opened_at")
  public OffsetDateTime openedAt;

  @Column(name = "equivalent_amount", precision = 24, scale = 2)
  public BigDecimal equivalentAmount;

  @Column(name = "equivalent_currency")
  public String equivalentCurrency;

  @Column(name = "exchange_rate", precision = 24, scale = 10)
  public BigDecimal exchangeRate;

  @Column(name = "conversion_as_of")
  public OffsetDateTime conversionAsOf;
}
