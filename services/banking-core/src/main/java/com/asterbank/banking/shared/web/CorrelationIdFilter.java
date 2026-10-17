package com.asterbank.banking.shared.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationIdFilter extends OncePerRequestFilter {
  public static final String HEADER = "X-Correlation-Id";
  private static final Pattern VALID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,63}");

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String supplied = request.getHeader(HEADER);
    String correlationId =
        supplied != null && VALID.matcher(supplied).matches()
            ? supplied
            : UUID.randomUUID().toString();
    response.setHeader(HEADER, correlationId);
    MDC.put("correlationId", correlationId);
    try {
      chain.doFilter(request, response);
    } finally {
      MDC.remove("correlationId");
    }
  }
}
