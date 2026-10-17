package com.asterbank.banking.shared.security;

import com.asterbank.banking.shared.domain.CustomerId;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public final class CurrentCustomerProvider {
  public CustomerId current() {
    var authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null
        || !authentication.isAuthenticated()
        || authentication instanceof AnonymousAuthenticationToken)
      throw new AuthenticationCredentialsNotFoundException("Authentication is required.");
    if (authentication.getPrincipal()
        instanceof com.asterbank.banking.security.adapter.security.CustomerPrincipal principal)
      return new CustomerId(principal.customerId());
    // Spring Security Test supplies UserDetails; runtime login always supplies CustomerPrincipal.
    if (authentication.getPrincipal()
        instanceof org.springframework.security.core.userdetails.UserDetails)
      return new CustomerId(authentication.getName());
    throw new AuthenticationCredentialsNotFoundException("Customer principal is required.");
  }
}
