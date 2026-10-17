package com.asterbank.banking.security.adapter.security;

import java.io.Serializable;
import java.security.Principal;

/** No credential material or persistence entity can enter the serialized security context. */
public record CustomerPrincipal(String customerId, String displayName)
    implements Principal, Serializable {
  private static final long serialVersionUID = 1L;

  public String getName() {
    return customerId;
  }
}
