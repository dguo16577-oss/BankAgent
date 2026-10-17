package com.asterbank.banking.customer.card.adapter.web;

import com.asterbank.banking.customer.card.application.CardFailure;
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

@ControllerAdvice(assignableTypes = CardController.class)
public class CardBodyValidation extends RequestBodyAdviceAdapter {
  private final ObjectMapper mapper;

  public CardBodyValidation(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  public boolean supports(MethodParameter p, Type t, Class<? extends HttpMessageConverter<?>> c) {
    return t == CreateCardActionIntentRequest.class || t == ExecuteCardActionRequest.class;
  }

  public HttpInputMessage beforeBodyRead(
      HttpInputMessage input,
      MethodParameter p,
      Type type,
      Class<? extends HttpMessageConverter<?>> converter)
      throws IOException {
    byte[] bytes = input.getBody().readNBytes(4097);
    if (bytes.length > 4096) invalid();
    JsonNode n;
    try {
      n = mapper.readTree(bytes);
    } catch (RuntimeException e) {
      throw new CardFailure(CardFailure.Code.INVALID_REQUEST);
    }
    if (n == null || !n.isObject()) invalid();
    if (type == ExecuteCardActionRequest.class) {
      fields(
          n,
          Set.of("intentId", "intentHash", "actionAuthorizationId"),
          Set.of("intentId", "intentHash"));
      text(n, "intentId");
      text(n, "intentHash");
      if (n.has("actionAuthorizationId")) text(n, "actionAuthorizationId");
    } else {
      String action = text(n, "actionType");
      text(n, "cardId");
      if (action.equals("UPDATE_CONTROLS")) {
        fields(
            n,
            Set.of("cardId", "actionType", "controls"),
            Set.of("cardId", "actionType", "controls"));
        var controls = n.get("controls");
        var names =
            Set.of("onlinePayments", "internationalPayments", "atmWithdrawals", "contactless");
        fields(controls, names, names);
        for (String key : names) if (!controls.get(key).isBoolean()) invalid();
      } else if (action.equals("UPDATE_LIMITS")) {
        fields(
            n, Set.of("cardId", "actionType", "limits"), Set.of("cardId", "actionType", "limits"));
        var limits = n.get("limits");
        fields(limits, Set.of("perTransaction", "daily"), Set.of("perTransaction", "daily"));
        text(limits, "perTransaction");
        text(limits, "daily");
      } else {
        if (!Set.of("FREEZE", "UNFREEZE", "REPORT_LOST").contains(action)) invalid();
        fields(n, Set.of("cardId", "actionType"), Set.of("cardId", "actionType"));
      }
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

  private void fields(JsonNode n, Set<String> allowed, Set<String> required) {
    if (n == null
        || !n.isObject()
        || !allowed.containsAll(n.propertyNames())
        || !n.propertyNames().containsAll(required)) invalid();
  }

  private String text(JsonNode n, String key) {
    var v = n.get(key);
    if (v == null || !v.isString()) invalid();
    return v.asText();
  }

  private void invalid() {
    throw new CardFailure(CardFailure.Code.INVALID_REQUEST);
  }
}
