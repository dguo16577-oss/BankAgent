package com.asterbank.banking.customer.card.application;

import com.asterbank.banking.customer.card.domain.CardAuthorization;
import com.asterbank.banking.shared.domain.CustomerId;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;

public interface CardAuthorizationStore {
  Optional<CardAuthorization> find(CustomerId owner, String requestKey);

  BigDecimal approvedAmount(CustomerId owner, String cardId, Instant start, Instant end);

  BigDecimal creditLimit(CustomerId owner, String cardId);

  void save(CardAuthorization decision);
}
