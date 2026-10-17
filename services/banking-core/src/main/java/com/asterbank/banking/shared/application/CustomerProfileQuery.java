package com.asterbank.banking.shared.application;

import com.asterbank.banking.shared.domain.CustomerId;

/** Non-secret customer display context, scoped by authenticated identity. */
public interface CustomerProfileQuery {
  record Profile(CustomerId id, String displayName) {}

  Profile profile(CustomerId owner);
}
