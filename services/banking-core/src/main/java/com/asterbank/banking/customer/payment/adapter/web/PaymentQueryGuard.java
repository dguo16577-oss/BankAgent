package com.asterbank.banking.customer.payment.adapter.web;

import com.asterbank.banking.customer.payment.application.PaymentFailure;
import jakarta.servlet.http.*;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.*;

@Configuration(proxyBeanMethods = false)
public class PaymentQueryGuard implements WebMvcConfigurer {
  public void addInterceptors(InterceptorRegistry registry) {
    registry
        .addInterceptor(
            new HandlerInterceptor() {
              public boolean preHandle(
                  HttpServletRequest request, HttpServletResponse response, Object handler) {
                request
                    .getParameterMap()
                    .forEach(
                        (key, values) -> {
                          if (!request.getRequestURI().equals("/customer/recipients")
                              || !key.equals("search")
                              || values.length != 1
                              || values[0].length() > 100)
                            throw new PaymentFailure(PaymentFailure.Code.INVALID_QUERY);
                        });
                return true;
              }
            })
        .addPathPatterns(
            "/customer/recipients",
            "/customer/transfer-intents",
            "/customer/transfer-intents/*",
            "/customer/transfers",
            "/customer/transfers/*");
  }
}
