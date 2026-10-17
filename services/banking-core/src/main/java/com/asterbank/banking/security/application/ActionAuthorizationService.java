package com.asterbank.banking.security.application;

import com.asterbank.banking.security.domain.SecurityState.*;

/**
 * Consume participates in the caller's database transaction; Card mutation must use the same
 * manager.
 */
public interface ActionAuthorizationService {
  Authorization require(
      String id, Binding binding, com.asterbank.banking.security.domain.VerificationAction action);

  Authorization validate(String id, Binding binding);

  Authorization consume(String id, Binding binding, String correlation);
}
