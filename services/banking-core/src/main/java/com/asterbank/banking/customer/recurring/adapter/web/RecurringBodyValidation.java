package com.asterbank.banking.customer.recurring.adapter.web;

import com.asterbank.banking.customer.recurring.domain.RecurringFailure;
import com.asterbank.contract.customer.model.*;
import java.io.*;
import java.lang.reflect.Type;
import java.util.Set;
import org.springframework.core.MethodParameter;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;
import tools.jackson.databind.*;

@ControllerAdvice(assignableTypes = RecurringController.class)
public class RecurringBodyValidation extends RequestBodyAdviceAdapter {
  private final ObjectMapper mapper;

  public RecurringBodyValidation(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  public boolean supports(MethodParameter p, Type t, Class<? extends HttpMessageConverter<?>> c) {
    return t == CreateRecurringPaymentActionIntentRequest.class
        || t == ExecuteRecurringPaymentActionRequest.class;
  }

  public HttpInputMessage beforeBodyRead(
      HttpInputMessage input,
      MethodParameter p,
      Type type,
      Class<? extends HttpMessageConverter<?>> converter)
      throws IOException {
    var bytes = input.getBody().readNBytes(4097);
    if (bytes.length > 4096) invalid();
    JsonNode n;
    try {
      n = mapper.readTree(bytes);
    } catch (RuntimeException e) {
      throw new RecurringFailure(RecurringFailure.Code.INVALID_REQUEST);
    }
    var names =
        type == ExecuteRecurringPaymentActionRequest.class
            ? Set.of("intentId", "intentHash", "actionAuthorizationId")
            : Set.of("recurringPaymentId", "actionType");
    if (n == null
        || !n.isObject()
        || !names.containsAll(n.propertyNames())
        || (n != null
            && n.isObject()
            && !n.propertyNames()
                .containsAll(
                    names.stream().filter(k -> !k.equals("actionAuthorizationId")).toList())))
      invalid();
    for (String key : n.propertyNames()) if (!n.get(key).isString()) invalid();
    if (type == CreateRecurringPaymentActionIntentRequest.class
        && !n.get("actionType").asString().equals("STOP_FUTURE_PAYMENTS")) invalid();
    return new HttpInputMessage() {
      public InputStream getBody() {
        return new ByteArrayInputStream(bytes);
      }

      public HttpHeaders getHeaders() {
        return input.getHeaders();
      }
    };
  }

  private void invalid() {
    throw new RecurringFailure(RecurringFailure.Code.INVALID_REQUEST);
  }
}
