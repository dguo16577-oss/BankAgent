package com.asterbank.banking.customer.payment.application;

import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.*;

public interface RecipientRepository {
  List<Recipient> list(CustomerId customer);

  Optional<Recipient> find(CustomerId customer, RecipientId id);

  default List<Recipient> search(CustomerId customer, String query) {
    var phone = RecipientPhone.canonical(query);
    return list(customer).stream()
        .filter(
            r ->
                phone == null
                    && (r.displayName().toLowerCase(Locale.ROOT).contains(query)
                        || r.bankName().toLowerCase(Locale.ROOT).contains(query)))
        .toList();
  }
}
