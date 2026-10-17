package com.asterbank.banking.customer.payment.adapter.web;

import static com.asterbank.banking.customer.payment.application.PaymentFailure.Code.*;

import com.asterbank.banking.customer.payment.application.PaymentFailure;
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

/** Enforces additionalProperties:false and wire types before generated DTO deserialization. */
@ControllerAdvice(
    assignableTypes = {
      PaymentController.class,
      RecipientController.class,
      ScheduleController.class
    })
public class PaymentBodyValidation extends RequestBodyAdviceAdapter {
  private final ObjectMapper mapper;

  public PaymentBodyValidation(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  public boolean supports(
      MethodParameter parameter, Type type, Class<? extends HttpMessageConverter<?>> converter) {
    return type == PrepareScheduleActionRequest.class
        || type == ExecuteScheduleActionRequest.class
        || type == CreateTransferIntentRequest.class
        || type == ExecuteTransferRequest.class
        || type == PrepareRecipientActionRequest.class
        || type == ExecuteRecipientActionRequest.class;
  }

  public HttpInputMessage beforeBodyRead(
      HttpInputMessage input,
      MethodParameter parameter,
      Type type,
      Class<? extends HttpMessageConverter<?>> converter)
      throws IOException {
    byte[] bytes = input.getBody().readNBytes(16385);
    if (bytes.length > 16384) throw new PaymentFailure(INVALID_REQUEST);
    JsonNode node;
    try {
      node = mapper.readTree(bytes);
    } catch (RuntimeException e) {
      throw new PaymentFailure(INVALID_REQUEST);
    }
    if (type == PrepareScheduleActionRequest.class) {
      var action = text(node, "actionType");
      if (action.equals("CANCEL")) {
        fields(
            node,
            Set.of("actionType", "scheduleId", "expectedVersion"),
            Set.of("actionType", "scheduleId", "expectedVersion"));
      } else if (action.equals("CREATE") || action.equals("AMEND")) {
        var allowed =
            new HashSet<>(
                Set.of("actionType", "sourceAccountId", "recipientId", "amount", "dueAt", "note"));
        var required =
            new HashSet<>(
                Set.of("actionType", "sourceAccountId", "recipientId", "amount", "dueAt"));
        if (action.equals("AMEND")) {
          allowed.addAll(Set.of("scheduleId", "expectedVersion"));
          required.addAll(Set.of("scheduleId", "expectedVersion"));
        }
        fields(node, allowed, required);
        text(node, "sourceAccountId");
        text(node, "recipientId");
        try {
          java.time.OffsetDateTime.parse(text(node, "dueAt"));
        } catch (RuntimeException e) {
          throw new PaymentFailure(INVALID_SCHEDULE_TIME);
        }
        var money = node.get("amount");
        fields(money, Set.of("amount", "currency"), Set.of("amount", "currency"));
        if (!text(money, "amount").matches("(0|[1-9][0-9]{0,11})\\.[0-9]{2}")
            || text(money, "amount").equals("0.00")) throw new PaymentFailure(INVALID_AMOUNT);
        if (!text(money, "currency").equals("CNY")) throw new PaymentFailure(CURRENCY_MISMATCH);
        if (node.has("note") && text(node, "note").length() > 140)
          throw new PaymentFailure(INVALID_REQUEST);
      } else throw new PaymentFailure(INVALID_REQUEST);
      if (node.has("scheduleId")) text(node, "scheduleId");
      if (node.has("expectedVersion")
          && (!node.get("expectedVersion").isIntegralNumber()
              || node.get("expectedVersion").asInt() < 0))
        throw new PaymentFailure(INVALID_REQUEST);
    } else if (type == PrepareRecipientActionRequest.class) {
      fields(node, Set.of("actionType", "destinationRef", "recipientId"), Set.of("actionType"));
      var action = text(node, "actionType");
      if (action.equals("CREATE")) {
        fields(
            node, Set.of("actionType", "destinationRef"), Set.of("actionType", "destinationRef"));
        text(node, "destinationRef");
      } else if (action.equals("DEACTIVATE")) {
        fields(node, Set.of("actionType", "recipientId"), Set.of("actionType", "recipientId"));
        text(node, "recipientId");
      } else throw new PaymentFailure(INVALID_REQUEST);
    } else if (type == ExecuteRecipientActionRequest.class) {
      fields(
          node,
          Set.of("intentId", "intentHash", "actionAuthorizationId"),
          Set.of("intentId", "intentHash"));
      text(node, "intentId");
      text(node, "intentHash");
      if (node.has("actionAuthorizationId")) text(node, "actionAuthorizationId");
    } else if ((type == ExecuteTransferRequest.class
        || type == ExecuteScheduleActionRequest.class)) {
      fields(
          node,
          Set.of("intentId", "intentHash", "actionAuthorizationId"),
          Set.of("intentId", "intentHash"));
      if (node.has("actionAuthorizationId") && text(node, "actionAuthorizationId").isBlank())
        throw new PaymentFailure(INVALID_REQUEST);
      text(node, "intentId");
      text(node, "intentHash");
    } else {
      fields(
          node,
          Set.of("sourceAccountId", "recipientId", "amount", "note"),
          Set.of("sourceAccountId", "recipientId", "amount"));
      text(node, "sourceAccountId");
      text(node, "recipientId");
      if (node.has("note") && (text(node, "note").length() > 140))
        throw new PaymentFailure(INVALID_REQUEST);
      var money = node.get("amount");
      fields(money, Set.of("amount", "currency"), Set.of("amount", "currency"));
      var amount = text(money, "amount");
      if (!amount.matches("(0|[1-9][0-9]{0,11})\\.[0-9]{2}") || amount.equals("0.00"))
        throw new PaymentFailure(INVALID_AMOUNT);
      if (!text(money, "currency").equals("CNY")) throw new PaymentFailure(CURRENCY_MISMATCH);
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

  private void fields(JsonNode node, Set<String> allowed, Set<String> required) {
    if (node == null
        || !node.isObject()
        || !node.propertyNames().containsAll(required)
        || !allowed.containsAll(node.propertyNames())) throw new PaymentFailure(INVALID_REQUEST);
  }

  private String text(JsonNode node, String name) {
    var value = node.get(name);
    if (value == null || !value.isString()) throw new PaymentFailure(INVALID_REQUEST);
    return value.asString();
  }
}
