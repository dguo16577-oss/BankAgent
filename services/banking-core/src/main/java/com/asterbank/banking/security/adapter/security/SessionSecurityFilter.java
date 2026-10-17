package com.asterbank.banking.security.adapter.security;

import com.asterbank.banking.security.application.*;
import com.asterbank.contract.customer.model.ApiError;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

public final class SessionSecurityFilter extends OncePerRequestFilter {
  private final SecurityService security;
  private final ObjectMapper mapper;

  public SessionSecurityFilter(SecurityService security, ObjectMapper mapper) {
    this.security = security;
    this.mapper = mapper;
  }

  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    response.setHeader("Cache-Control", "no-store");
    if (request.getRequestURI().equals("/customer/session")) {
      var token = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
      if (token != null) token.getToken();
    }
    var auth = SecurityContextHolder.getContext().getAuthentication();
    if (auth != null && auth.getPrincipal() instanceof CustomerPrincipal principal) {
      var session = request.getSession(false);
      try {
        if (session == null) throw new SecurityFailure("UNAUTHENTICATED", 401);
        security.session(principal.customerId(), session.getId());
      } catch (SecurityFailure failure) {
        if (session != null) session.invalidate();
        SecurityContextHolder.clearContext();
        response.setStatus(failure.status());
        response.setContentType("application/json");
        mapper.writeValue(
            response.getOutputStream(),
            new ApiError(ApiError.CodeEnum.fromValue(failure.code()), failure.getMessage()));
        return;
      }
    }
    chain.doFilter(request, response);
  }
}
