package com.asterbank.banking.customer.wealth.adapter.web;

import static com.asterbank.banking.customer.wealth.domain.WealthFailure.Code.*;

import com.asterbank.banking.customer.wealth.domain.WealthFailure;
import com.asterbank.contract.customer.model.*;
import java.io.*;
import java.lang.reflect.Type;
import java.math.BigDecimal;
import java.util.Set;
import org.springframework.core.MethodParameter;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;
import tools.jackson.databind.*;

@ControllerAdvice(assignableTypes = WealthController.class)
public class WealthBodyValidation extends RequestBodyAdviceAdapter {
  private final ObjectMapper mapper;

  public WealthBodyValidation(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  public boolean supports(MethodParameter p, Type t, Class<? extends HttpMessageConverter<?>> c) {
    return t == CreateSuitabilityCheckRequest.class
        || t == CreateInvestmentOrderIntentRequest.class
        || t == ExecuteInvestmentOrderRequest.class;
  }

  public HttpInputMessage beforeBodyRead(
      HttpInputMessage input,
      MethodParameter p,
      Type type,
      Class<? extends HttpMessageConverter<?>> c)
      throws IOException {
    var bytes = input.getBody().readNBytes(4097);
    if (bytes.length > 4096) throw new WealthFailure(INVALID_REQUEST);
    JsonNode n;
    try {
      n = mapper.readTree(bytes);
    } catch (RuntimeException e) {
      throw new WealthFailure(INVALID_REQUEST);
    }
    var names =
        type == CreateSuitabilityCheckRequest.class
            ? Set.of("productId")
            : type == ExecuteInvestmentOrderRequest.class
                ? Set.of("intentId", "intentHash", "actionAuthorizationId")
                : Set.of("productId", "sourceAccountId", "amount", "suitabilityCheckId");
    if (n == null
        || !n.isObject()
        || !names.containsAll(n.propertyNames())
        || (n != null
            && n.isObject()
            && !n.propertyNames()
                .containsAll(
                    names.stream().filter(k -> !k.equals("actionAuthorizationId")).toList())))
      throw new WealthFailure(INVALID_REQUEST);
    for (String key : n.propertyNames())
      if (!key.equals("amount")
          && (!n.get(key).isString()
              || n.get(key).asString().isEmpty()
              || n.get(key).asString().length() > 255)) throw new WealthFailure(INVALID_REQUEST);
    if (type == CreateInvestmentOrderIntentRequest.class) {
      var m = n.get("amount");
      if (!m.isObject() || !m.propertyNames().equals(Set.of("amount", "currency")))
        throw new WealthFailure(INVALID_REQUEST);
      var value = m.get("amount");
      if (!value.isString()
          || !value.asString().matches("^(0|[1-9][0-9]{0,11})(\\.[0-9]{1,2})?$")
          || new BigDecimal(value.asString()).signum() <= 0)
        throw new WealthFailure(INVALID_AMOUNT);
      if (!m.get("currency").isString()
          || !Set.of("CNY", "USD").contains(m.get("currency").asString()))
        throw new WealthFailure(CURRENCY_MISMATCH);
    }
    return new HttpInputMessage() {
      public InputStream getBody() {
        return new ByteArrayInputStream(bytes);
      }

      public HttpHeaders getHeaders() {
        return input.getHeaders();
      }
    };
  }
}
