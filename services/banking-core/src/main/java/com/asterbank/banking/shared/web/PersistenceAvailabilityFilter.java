package com.asterbank.banking.shared.web;

import com.asterbank.contract.customer.model.ApiError;
import com.asterbank.contract.publicapi.model.PublicApiError;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.TransactionException;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

/** Session repository failures occur before MVC exception advice can handle them. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class PersistenceAvailabilityFilter extends OncePerRequestFilter {
  private static final Logger LOG = LoggerFactory.getLogger(PersistenceAvailabilityFilter.class);
  private final ObjectMapper mapper;

  public PersistenceAvailabilityFilter(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    try {
      chain.doFilter(request, response);
    } catch (RuntimeException | ServletException failure) {
      if (!isPersistenceFailure(failure) || response.isCommitted()) throw failure;
      LOG.warn("Persistence unavailable before request completion");
      response.resetBuffer();
      response.setContentType("application/json");
      response.setHeader("Cache-Control", "no-store");
      String path = request.getRequestURI();
      boolean health = path.equals("/actuator/health");
      response.setStatus(health ? 503 : 500);
      Object body =
          health
              ? Map.of("status", "DOWN")
              : path.startsWith("/public/")
                  ? new PublicApiError(
                      PublicApiError.CodeEnum.PUBLIC_CONTENT_UNAVAILABLE,
                      "Public content is temporarily unavailable.")
                  : new ApiError(
                      ApiError.CodeEnum.PERSISTENCE_UNAVAILABLE,
                      "Banking services are temporarily unavailable. Please retry.");
      mapper.writeValue(response.getOutputStream(), body);
    }
  }

  private boolean isPersistenceFailure(Throwable failure) {
    for (int depth = 0; failure != null && depth < 20; depth++, failure = failure.getCause())
      if (failure instanceof DataAccessException
          || failure instanceof TransactionException
          || failure instanceof java.sql.SQLException) return true;
    return false;
  }
}
