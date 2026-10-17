package com.asterbank.banking.customer.recurring.adapter.web;

import com.asterbank.banking.customer.recurring.adapter.persistence.RenewalReminderService;
import com.asterbank.banking.shared.security.CurrentCustomerProvider;
import com.asterbank.contract.customer.api.*;
import com.asterbank.contract.customer.model.*;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

@RestController
@Profile("!unit")
public class RenewalReminderController
    implements ListRenewalRemindersApi,
        GetRenewalReminderApi,
        PrepareRenewalReminderActionApi,
        GetRenewalReminderActionIntentApi,
        CancelRenewalReminderActionIntentApi,
        ExecuteRenewalReminderActionApi,
        ListInAppNotificationsApi {
  private final RenewalReminderService service;
  private final CurrentCustomerProvider current;
  private final ObjectMapper mapper;
  private final HttpServletRequest request;

  public RenewalReminderController(
      RenewalReminderService service,
      CurrentCustomerProvider current,
      ObjectMapper mapper,
      HttpServletRequest request) {
    this.service = service;
    this.current = current;
    this.mapper = mapper;
    this.request = request;
  }

  private String owner() {
    return current.current().value();
  }

  private void noQuery() {
    if (!request.getParameterMap().isEmpty())
      throw new RenewalReminderService.Failure(
          org.springframework.http.HttpStatus.BAD_REQUEST, "INVALID_REQUEST");
  }

  public ResponseEntity<RenewalRemindersResponse> listRenewalReminders() {
    noQuery();
    return ResponseEntity.ok(
        new RenewalRemindersResponse(
            service.list(owner()).stream()
                .map(m -> mapper.convertValue(m, RenewalReminder.class))
                .toList()));
  }

  public ResponseEntity<RenewalReminder> getRenewalReminder(String id) {
    noQuery();
    return ResponseEntity.ok(mapper.convertValue(service.get(owner(), id), RenewalReminder.class));
  }

  public ResponseEntity<RenewalReminderActionIntent> prepareRenewalReminderAction(
      CreateRenewalReminderActionIntentRequest body) {
    noQuery();
    Map<String, Object> terms = new LinkedHashMap<>();
    terms.put("actionType", body.getActionType() == null ? null : body.getActionType().getValue());
    terms.put("recurringPaymentId", body.getRecurringPaymentId());
    if (body.getPatternEvidenceTransactionIds() != null
        && !body.getPatternEvidenceTransactionIds().isEmpty())
      terms.put("patternEvidenceTransactionIds", body.getPatternEvidenceTransactionIds());
    if (body.getPatternCadence() != null)
      terms.put("patternCadence", body.getPatternCadence().getValue());
    if (body.getReminderId() != null) terms.put("reminderId", body.getReminderId());
    if (body.getExpectedVersion() != null) terms.put("expectedVersion", body.getExpectedVersion());
    if (body.getDueAt() != null) terms.put("dueAt", body.getDueAt());
    if (body.getTimeZone() != null) terms.put("timeZone", body.getTimeZone());
    return ResponseEntity.status(201)
        .body(
            mapper.convertValue(
                service.prepare(owner(), terms), RenewalReminderActionIntent.class));
  }

  public ResponseEntity<RenewalReminderActionIntent> getRenewalReminderActionIntent(String id) {
    noQuery();
    return ResponseEntity.ok(
        mapper.convertValue(service.getIntent(owner(), id), RenewalReminderActionIntent.class));
  }

  public ResponseEntity<RenewalReminderActionIntent> cancelRenewalReminderActionIntent(String id) {
    noQuery();
    return ResponseEntity.ok(
        mapper.convertValue(service.cancelIntent(owner(), id), RenewalReminderActionIntent.class));
  }

  public ResponseEntity<RenewalReminderActionReceipt> executeRenewalReminderAction(
      String key, ExecuteRenewalReminderActionRequest body) {
    noQuery();
    return ResponseEntity.ok(
        mapper.convertValue(
            service.execute(
                owner(),
                key,
                Map.of("intentId", body.getIntentId(), "intentHash", body.getIntentHash())),
            RenewalReminderActionReceipt.class));
  }

  public ResponseEntity<InAppNotificationsResponse> listInAppNotifications() {
    noQuery();
    return ResponseEntity.ok(
        new InAppNotificationsResponse(
            service.notifications(owner()).stream()
                .map(m -> mapper.convertValue(m, InAppNotification.class))
                .toList()));
  }

  @ExceptionHandler(RenewalReminderService.Failure.class)
  public ResponseEntity<Map<String, String>> failure(RenewalReminderService.Failure failure) {
    return ResponseEntity.status(failure.status())
        .body(Map.of("code", failure.getMessage(), "message", failure.getMessage()));
  }
}
