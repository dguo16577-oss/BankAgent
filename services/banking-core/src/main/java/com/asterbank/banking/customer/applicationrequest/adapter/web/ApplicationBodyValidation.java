package com.asterbank.banking.customer.applicationrequest.adapter.web;

import com.asterbank.banking.customer.applicationrequest.domain.ApplicationFailure;
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

@ControllerAdvice(assignableTypes = ApplicationController.class)
public class ApplicationBodyValidation extends RequestBodyAdviceAdapter {
  private final ObjectMapper mapper;

  public ApplicationBodyValidation(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  public boolean supports(MethodParameter p, Type t, Class<? extends HttpMessageConverter<?>> c) {
    return t == SubmitProductApplicationRequest.class || t == PrepareApplicationIntentRequest.class;
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
      throw new ApplicationFailure(ApplicationFailure.Code.INVALID_REQUEST);
    }
    var required = Set.of("productId", "accountId", "contactEmail", "consent");
    var allowed =
        new java.util.HashSet<>(
            Set.of(
                "productId",
                "accountId",
                "contactEmail",
                "consent",
                "monthlyIncome",
                "requestedAmount",
                "termMonths",
                "purpose",
                "applicationDetails"));
    if (type == SubmitProductApplicationRequest.class)
      allowed.addAll(Set.of("intentId", "intentHash", "actionAuthorizationId"));
    if (n == null
        || !n.isObject()
        || !n.propertyNames().containsAll(required)
        || !allowed.containsAll(n.propertyNames())) invalid();
    for (String k : Set.of("productId", "accountId", "contactEmail"))
      if (!n.get(k).isString()) invalid();
    if (!n.get("consent").isBoolean() || !n.get("consent").asBoolean()) invalid();
    for (String key : Set.of("intentId", "intentHash", "actionAuthorizationId"))
      if (n.has(key) && !n.get(key).isString()) invalid();
    if (n.has("purpose") && !n.get("purpose").isString()) invalid();
    if (n.has("termMonths") && !n.get("termMonths").isIntegralNumber()) invalid();
    if (n.has("applicationDetails")) {
      var d = n.get("applicationDetails");
      var detailKeys =
          Set.of(
              "cardUsage",
              "employmentStatus",
              "savingsGoal",
              "plannedMonthlyContribution",
              "coverageAmount",
              "beneficiaryRelationship",
              "householdSize",
              "tripStartDate",
              "tripEndDate",
              "propertyType");
      if (!d.isObject() || !detailKeys.containsAll(d.propertyNames())) invalid();
      for (String k :
          Set.of(
              "cardUsage",
              "employmentStatus",
              "savingsGoal",
              "beneficiaryRelationship",
              "tripStartDate",
              "tripEndDate",
              "propertyType")) if (d.has(k) && !d.get(k).isString()) invalid();
      if (d.has("householdSize") && !d.get("householdSize").isIntegralNumber()) invalid();
      for (String k : Set.of("plannedMonthlyContribution", "coverageAmount"))
        if (d.has(k)) validateMoney(d.get(k));
    }
    for (String k : Set.of("monthlyIncome", "requestedAmount"))
      if (n.has(k)) validateMoney(n.get(k));
    return new HttpInputMessage() {
      public InputStream getBody() {
        return new ByteArrayInputStream(bytes);
      }

      public HttpHeaders getHeaders() {
        return input.getHeaders();
      }
    };
  }

  private void validateMoney(JsonNode m) {
    if (!m.isObject()
        || !m.propertyNames().equals(Set.of("amount", "currency"))
        || !m.get("amount").isString()
        || !m.get("currency").isString()
        || !m.get("amount").asString().matches("(?:0|[1-9][0-9]{0,7})\\.[0-9]{2}")
        || !m.get("currency").asString().equals("CNY")) invalid();
  }

  private void invalid() {
    throw new ApplicationFailure(ApplicationFailure.Code.INVALID_REQUEST);
  }
}
