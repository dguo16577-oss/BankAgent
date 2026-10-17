package com.asterbank.banking.shared.web;

import com.asterbank.banking.customer.transaction.application.*;
import jakarta.servlet.http.*;
import java.util.Set;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.*;

@Configuration(proxyBeanMethods = false)
public class TransactionQueryGuard implements WebMvcConfigurer {
  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry
        .addInterceptor(
            new HandlerInterceptor() {
              @Override
              public boolean preHandle(
                  HttpServletRequest request, HttpServletResponse response, Object handler) {
                if (!request.getMethod().equals("GET")) return true;
                var allowed =
                    Set.of(
                        "accountId",
                        "cardId",
                        "from",
                        "to",
                        "status",
                        "direction",
                        "type",
                        "category",
                        "search",
                        "cursor",
                        "limit");
                request
                    .getParameterMap()
                    .forEach(
                        (key, values) -> {
                          if (!allowed.contains(key) || values.length != 1)
                            throw new InvalidQuery();
                        });
                String cursor = request.getParameter("cursor");
                if (cursor != null && cursor.length() > 2048) throw new InvalidCursor();
                String limit = request.getParameter("limit");
                if (limit != null && !limit.matches("[0-9]+")) throw new InvalidQuery();
                return true;
              }
            })
        .addPathPatterns("/customer/transactions");
  }
}
