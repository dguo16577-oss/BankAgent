package com.asterbank.banking.customer.payment.application;

import com.asterbank.banking.customer.payment.domain.Recipient;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.*;

public final class RecipientQueryService {
  private final RecipientRepository repository;

  public RecipientQueryService(RecipientRepository repository) {
    this.repository = repository;
  }

  public List<Recipient> list(CustomerId customer, String search) {
    if (search != null && search.length() > 100)
      throw new PaymentFailure(PaymentFailure.Code.INVALID_QUERY);
    String query = search == null ? "" : search.strip().toLowerCase(Locale.ROOT);
    return repository.search(customer, query);
  }
}
