package com.asterbank.banking.security.adapter.web;

import com.asterbank.banking.security.adapter.security.CustomerPrincipal;
import com.asterbank.banking.security.application.*;
import com.asterbank.banking.security.domain.SecurityState;
import com.asterbank.contract.customer.api.*;
import com.asterbank.contract.customer.model.*;
import jakarta.servlet.http.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.*;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.web.bind.annotation.*;

@RestController
@Profile("!unit")
public class SecurityController
    implements LoginApi,
        LogoutApi,
        GetSessionApi,
        CreateStepUpChallengeApi,
        GetStepUpChallengeApi,
        VerifyStepUpChallengeApi,
        GetCustomerVerificationProfileApi,
        GetDemoSmsMessageApi {
  private final AuthenticationManager authentication;
  private final SecurityService service;
  private final HttpServletRequest request;
  private final HttpServletResponse response;
  private final SessionAuthenticationStrategy strategy;
  private final HttpSessionSecurityContextRepository contexts;
  private final CookieCsrfTokenRepository csrf;
  private final JdbcTemplate db;

  public SecurityController(
      AuthenticationManager authentication,
      SecurityService service,
      HttpServletRequest request,
      HttpServletResponse response,
      SessionAuthenticationStrategy strategy,
      HttpSessionSecurityContextRepository contexts,
      CookieCsrfTokenRepository csrf,
      JdbcTemplate db) {
    this.authentication = authentication;
    this.service = service;
    this.request = request;
    this.response = response;
    this.strategy = strategy;
    this.contexts = contexts;
    this.csrf = csrf;
    this.db = db;
  }

  private String correlation() {
    return org.slf4j.MDC.get("correlationId");
  }

  private CustomerPrincipal principal() {
    return (CustomerPrincipal)
        SecurityContextHolder.getContext().getAuthentication().getPrincipal();
  }

  private String sessionId() {
    return request.getSession(false).getId();
  }

  public ResponseEntity<Session> login(LoginRequest body) {
    org.springframework.security.core.Authentication validated;
    try {
      if (body.getPassword() == null
          || body.getPassword().getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72)
        throw new BadCredentialsException("Invalid credentials");
      validated =
          authentication.authenticate(
              UsernamePasswordAuthenticationToken.unauthenticated(
                  body.getEmail(), body.getPassword()));
    } catch (AuthenticationException failure) {
      service.loginFailure(correlation());
      throw new SecurityFailure("INVALID_CREDENTIALS", 401);
    }
    var old = SecurityContextHolder.getContext().getAuthentication();
    if (old != null
        && old.getPrincipal() instanceof CustomerPrincipal p
        && request.getSession(false) != null)
      service.logout(p.customerId(), sessionId(), correlation());
    var p =
        new CustomerPrincipal(
            validated.getName(),
            db.queryForObject(
                "select display_name from customers where customer_id=?",
                String.class,
                validated.getName()));
    var auth =
        UsernamePasswordAuthenticationToken.authenticated(p, null, validated.getAuthorities());
    // Ensure fixation strategy also rotates an existing anonymous session.
    request.getSession(true);
    strategy.onAuthentication(auth, request, response);
    var s = service.login(p.customerId(), sessionId(), correlation());
    var context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(auth);
    SecurityContextHolder.setContext(context);
    contexts.saveContext(context, request, response);
    return ResponseEntity.ok(session(s, p));
  }

  public ResponseEntity<Session> getSession() {
    var p = principal();
    return ResponseEntity.ok(session(service.session(p.customerId(), sessionId()), p));
  }

  public ResponseEntity<LogoutResponse> logout() {
    var p = principal();
    service.logout(p.customerId(), sessionId(), correlation());
    request.getSession(false).invalidate();
    SecurityContextHolder.clearContext();
    csrf.saveToken(null, request, response);
    return ResponseEntity.ok(new LogoutResponse(LogoutResponse.StatusEnum.REVOKED));
  }

  public ResponseEntity<StepUpChallenge> createStepUpChallenge(CreateStepUpChallengeRequest body) {
    var b =
        new SecurityState.Binding(
            principal().customerId(),
            sessionId(),
            body.getResourceType().getValue(),
            body.getResourceId(),
            body.getResourceHash());
    return ResponseEntity.ok(
        challenge(
            service.create(
                b,
                com.asterbank.banking.security.domain.VerificationAction.valueOf(
                    body.getActionType().name()),
                correlation())));
  }

  public ResponseEntity<StepUpChallenge> getStepUpChallenge(String id) {
    return ResponseEntity.ok(
        challenge(service.challenge(principal().customerId(), sessionId(), id)));
  }

  public ResponseEntity<StepUpVerificationResponse> verifyStepUpChallenge(
      String id, VerifyStepUpRequest body) {
    var v =
        service.verify(
            principal().customerId(),
            sessionId(),
            id,
            body.getCode(),
            body.getPassword(),
            correlation());
    return ResponseEntity.ok(
        new StepUpVerificationResponse(challenge(v.challenge()), authorization(v.authorization())));
  }

  public ResponseEntity<CustomerVerificationProfile> getCustomerVerificationProfile() {
    var phone = service.phone(principal().customerId());
    var factors =
        new java.util.ArrayList<CustomerVerificationProfile.AvailableVerificationFactorsEnum>();
    factors.add(CustomerVerificationProfile.AvailableVerificationFactorsEnum.PASSWORD);
    if (service.smsAvailable())
      factors.add(CustomerVerificationProfile.AvailableVerificationFactorsEnum.SMS_OTP);
    return ResponseEntity.ok(
        new CustomerVerificationProfile(
            phone.masked(), phone.verified(), factors, service.demoSmsAvailable()));
  }

  public ResponseEntity<DemoSmsMessage> getDemoSmsMessage(String id) {
    var m = service.message(principal().customerId(), sessionId(), id);
    return ResponseEntity.ok(
        new DemoSmsMessage(
            m.id(), m.challengeId(), m.maskedPhone(), m.messageBody(), m.createdAt().toString()));
  }

  private Session session(SecurityState.Session s, CustomerPrincipal p) {
    return new Session(
        s.id(),
        true,
        new User(p.customerId(), p.displayName()),
        SessionStatus.ACTIVE,
        AssuranceLevel.AAL1,
        s.authenticatedAt().toString(),
        s.expiresAt().toString(),
        Session.ModeEnum.SIMULATED_AUTH);
  }

  private StepUpChallenge challenge(SecurityState.Challenge c) {
    return new StepUpChallenge(
            c.id(),
            StepUpChallenge.ResourceTypeEnum.fromValue(c.binding().resourceType()),
            c.binding().resourceId(),
            c.binding().resourceHash(),
            StepUpMethod.ACCOUNT_ACTION_VERIFICATION,
            StepUpChallengeStatus.fromValue(c.status().name()),
            c.createdAt().toString(),
            c.expiresAt().toString(),
            c.attemptsRemaining(),
            VerificationAction.fromValue(c.action().name()),
            VerificationRequirement.fromValue(c.requirement().name()))
        .maskedPhone(c.maskedPhone())
        .actionAuthorizationId(c.authorizationId());
  }

  private ActionAuthorization authorization(SecurityState.Authorization a) {
    return new ActionAuthorization(
        a.id(),
        ActionAuthorization.ResourceTypeEnum.fromValue(a.binding().resourceType()),
        a.binding().resourceId(),
        a.binding().resourceHash(),
        AssuranceLevel.AAL2,
        AuthorizationStatus.fromValue(a.status().name()),
        a.issuedAt().toString(),
        a.expiresAt().toString(),
        a.consumedAt() == null ? null : a.consumedAt().toString(),
        VerificationAction.fromValue(
            service
                .challenge(a.binding().customerId(), a.binding().sessionId(), a.challengeId())
                .action()
                .name()));
  }

  @ExceptionHandler(SecurityFailure.class)
  ResponseEntity<ApiError> failure(SecurityFailure f) {
    return ResponseEntity.status(f.status())
        .body(new ApiError(ApiError.CodeEnum.fromValue(f.code()), f.getMessage()));
  }
}
