package com.asterbank.banking.security.adapter.web;

import com.asterbank.banking.security.application.SecurityFailure;
import com.asterbank.contract.customer.model.*;
import java.io.*;
import java.lang.reflect.Type;
import java.util.*;
import org.springframework.core.MethodParameter;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;
import tools.jackson.databind.*;

/** Never let generated DTO coercion relax the frozen wire types or additionalProperties:false. */
@ControllerAdvice(assignableTypes = SecurityController.class)
public class SecurityBodyValidation extends RequestBodyAdviceAdapter {
  private final ObjectMapper mapper;

  public SecurityBodyValidation(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  public boolean supports(
      MethodParameter p, Type type, Class<? extends HttpMessageConverter<?>> converter) {
    return type == LoginRequest.class
        || type == CreateStepUpChallengeRequest.class
        || type == VerifyStepUpRequest.class;
  }

  public HttpInputMessage beforeBodyRead(
      HttpInputMessage input,
      MethodParameter parameter,
      Type type,
      Class<? extends HttpMessageConverter<?>> converter)
      throws IOException {
    byte[] bytes = input.getBody().readNBytes(4097);
    if (bytes.length > 4096) throw new SecurityFailure("INVALID_REQUEST", 400);
    JsonNode node;
    try {
      node = mapper.readTree(bytes);
    } catch (RuntimeException e) {
      throw new SecurityFailure("INVALID_REQUEST", 400);
    }
    Set<String> fields =
        type == LoginRequest.class
            ? Set.of("email", "password")
            : type == VerifyStepUpRequest.class
                ? Set.of("code", "password")
                : Set.of("resourceType", "resourceId", "resourceHash", "actionType");
    if (node == null
        || !node.isObject()
        || !fields.containsAll(node.propertyNames())
        || (type != VerifyStepUpRequest.class && !node.propertyNames().equals(fields)))
      throw new SecurityFailure("INVALID_REQUEST", 400);
    for (String key : node.propertyNames())
      if (!node.get(key).isString()) throw new SecurityFailure("INVALID_REQUEST", 400);
    if (type == CreateStepUpChallengeRequest.class
        && !Set.of(
                "CARD_ACTION_INTENT",
                "TRANSFER_INTENT",
                "SCHEDULE_ACTION_INTENT",
                "SPLIT_ACTION_INTENT",
                "RECIPIENT_ACTION_INTENT",
                "INVESTMENT_ORDER_INTENT",
                "RECURRING_PAYMENT_INTENT",
                "APPLICATION_INTENT")
            .contains(node.get("resourceType").asText()))
      throw new SecurityFailure("INVALID_REQUEST", 400);
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
