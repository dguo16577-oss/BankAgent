package com.asterbank.banking;

import com.asterbank.banking.security.application.*;
import com.asterbank.banking.security.domain.*;
import com.asterbank.banking.security.domain.SecurityState.*;
import org.springframework.jdbc.core.JdbcTemplate;

final class B4TestVerification {
  static void phones(JdbcTemplate db) {
    db.update(
        "insert into customer_phone_bindings(binding_id,customer_id,phone_e164,status,verified_at,created_at) select 'phone_'||customer_id,customer_id,'+8613812345678','VERIFIED',current_timestamp,current_timestamp from customers on conflict(customer_id) do nothing");
  }

  static VerificationAction action(String type) {
    return switch (type) {
      case "TRANSFER_INTENT" -> VerificationAction.TRANSFER_EXECUTE;
      case "SCHEDULE_ACTION_INTENT" -> VerificationAction.SCHEDULED_PAYMENT_CREATE;
      case "RECIPIENT_ACTION_INTENT" -> VerificationAction.RECIPIENT_CREATE;
      case "INVESTMENT_ORDER_INTENT" -> VerificationAction.INVESTMENT_ORDER_EXECUTE;
      case "RECURRING_PAYMENT_INTENT" -> VerificationAction.RECURRING_STOP_FUTURE_PAYMENTS;
      default -> VerificationAction.CARD_UNFREEZE;
    };
  }

  static Challenge create(JdbcTemplate db, SecurityService service, Binding b, String correlation) {
    phones(db);
    return service.create(b, action(b.resourceType()), correlation);
  }

  static String code(JdbcTemplate db, String challenge) {
    var rows =
        db.queryForList(
            "select message_body from demo_sms_outbox where challenge_id=?",
            String.class,
            challenge);
    if (rows.isEmpty()) return null;
    var matcher = java.util.regex.Pattern.compile("\\b[0-9]{6}\\b").matcher(rows.getFirst());
    if (!matcher.find()) throw new AssertionError("OTP not delivered");
    return matcher.group();
  }

  static Verification verify(
      JdbcTemplate db,
      SecurityService service,
      String customer,
      String session,
      String id,
      String code,
      String correlation) {
    return service.verify(
        customer,
        session,
        id,
        "246810".equals(code) ? code(db, id) : code,
        "demo-password",
        correlation);
  }

  static synchronized String session(
      org.springframework.context.ApplicationContext context, String customer) {
    var db = context.getBean(JdbcTemplate.class);
    var service = context.getBean(SecurityService.class);
    var session = "b4-domain-" + customer;
    if (db.queryForObject(
            "select count(*) from security_sessions where session_id=?", Integer.class, session)
        == 0) service.login(customer, session, null);
    return session;
  }

  static synchronized String domainGrant(
      org.springframework.context.ApplicationContext context,
      String customer,
      String session,
      String resource,
      String id,
      String hash,
      VerificationAction action) {
    var db = context.getBean(JdbcTemplate.class);
    var prior =
        db.queryForList(
            "select a.authorization_id from action_authorizations a join step_up_challenges c on c.challenge_id=a.challenge_id where a.customer_id=? and a.session_id=? and a.resource_type=? and a.resource_id=? and a.resource_hash=? and c.action_type=? order by a.issued_at desc",
            String.class,
            customer,
            session,
            resource,
            id,
            hash,
            action.name());
    if (!prior.isEmpty()) return prior.getFirst();
    return grant(
        db,
        context.getBean(SecurityService.class),
        new Binding(customer, session, resource, id, hash),
        action);
  }

  static String grant(
      JdbcTemplate db, SecurityService service, Binding binding, VerificationAction action) {
    phones(db);
    var c = service.create(binding, action, null);
    return service
        .verify(
            binding.customerId(),
            binding.sessionId(),
            c.id(),
            code(db, c.id()),
            "demo-password",
            null)
        .authorization()
        .id();
  }

  @FunctionalInterface
  interface HttpGet {
    java.net.http.HttpResponse<String> get(String path) throws Exception;
  }

  @FunctionalInterface
  interface HttpPost {
    java.net.http.HttpResponse<String> post(String path, String body) throws Exception;
  }

  // Test-only browser helper: prepares a real challenge and verifies real factors before
  // submitting.
  static String verifiedBody(
      JdbcTemplate db,
      HttpGet get,
      HttpPost post,
      String path,
      String body,
      java.util.Map<String, String> grants)
      throws Exception {
    var json = tools.jackson.databind.json.JsonMapper.builder().build();
    var input = json.readTree(body);
    if (!input.isObject() || input.has("actionAuthorizationId")) return body;
    String route =
        switch (path) {
          case "/customer/transfers" -> "/customer/transfer-intents/";
          case "/customer/recipients", "/customer/recipient-actions" ->
              "/customer/recipient-action-intents/";
          case "/customer/scheduled-payment-actions" -> "/customer/scheduled-payment-intents/";
          case "/customer/card-actions" -> "/customer/card-action-intents/";
          case "/customer/investment-orders" -> "/customer/investment-order-intents/";
          case "/customer/investment-redemptions" -> "/customer/investment-redemption-intents/";
          case "/customer/recurring-payment-actions" ->
              "/customer/recurring-payment-action-intents/";
          default -> null;
        };
    if (route == null
        || !input.path("intentId").isTextual()
        || !input.path("intentHash").isTextual()) return body;
    var id = input.path("intentId").asText();
    var grant = grants.get(id);
    if (grant == null) {
      var response = get.get(route + id);
      if (response.statusCode() != 200) return body; // Preserve malformed/not-found negative tests.
      var intent = json.readTree(response.body());
      String action =
          switch (path) {
            case "/customer/transfers" -> "TRANSFER_EXECUTE";
            case "/customer/recipients" -> "RECIPIENT_CREATE";
            case "/customer/recipient-actions" -> "RECIPIENT_DEACTIVATE";
            case "/customer/scheduled-payment-actions" ->
                "SCHEDULED_PAYMENT_"
                    + (intent.path("actionType").asText().equals("AMEND")
                        ? "MODIFY"
                        : intent.path("actionType").asText());
            case "/customer/card-actions" ->
                intent.path("actionType").asText().equals("UPDATE_CONTROLS")
                    ? "CARD_CONTROL_" + intent.path("riskDirection").asText()
                    : "CARD_" + intent.path("actionType").asText();
            case "/customer/investment-orders", "/customer/investment-redemptions" ->
                "INVESTMENT_ORDER_EXECUTE";
            default -> "RECURRING_STOP_FUTURE_PAYMENTS";
          };
      var a = VerificationAction.valueOf(action);
      if (VerificationPolicy.resolve(a) == VerificationRequirement.NONE) return body;
      phones(db);
      var created =
          post.post(
              "/customer/auth/step-up-challenges",
              json.writeValueAsString(
                  java.util.Map.of(
                      "actionType",
                      action,
                      "resourceType",
                      a.resourceType(),
                      "resourceId",
                      id,
                      "resourceHash",
                      intent.path("intentHash").asText())));
      org.assertj.core.api.Assertions.assertThat(created.statusCode())
          .as(created.body())
          .isEqualTo(200);
      var challenge = json.readTree(created.body()).path("id").asText();
      var factors = new java.util.HashMap<String, String>();
      factors.put("password", "demo-password");
      var otp = code(db, challenge);
      if (otp != null) factors.put("code", otp);
      var verified =
          post.post(
              "/customer/auth/step-up-challenges/" + challenge + "/verify",
              json.writeValueAsString(factors));
      org.assertj.core.api.Assertions.assertThat(verified.statusCode())
          .as(verified.body())
          .isEqualTo(200);
      grant = json.readTree(verified.body()).path("authorization").path("id").asText();
      grants.put(id, grant);
    }
    ((tools.jackson.databind.node.ObjectNode) input).put("actionAuthorizationId", grant);
    return json.writeValueAsString(input);
  }
}
