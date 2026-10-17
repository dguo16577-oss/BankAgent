package com.asterbank.banking.customer.applicationrequest.adapter.web;

import com.asterbank.banking.customer.applicationrequest.application.ApplicationService;
import com.asterbank.banking.customer.applicationrequest.domain.*;
import com.asterbank.banking.shared.security.CurrentCustomerProvider;
import com.asterbank.contract.customer.api.*;
import com.asterbank.contract.customer.model.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!unit")
public class ApplicationController
    implements ListProductApplicationsApi,
        GetProductApplicationApi,
        SubmitProductApplicationApi,
        PrepareApplicationIntentApi,
        CancelApplicationIntentApi {
  private final ApplicationService service;
  private final CurrentCustomerProvider customer;
  private final HttpServletRequest http;

  public ApplicationController(
      ApplicationService service, CurrentCustomerProvider customer, HttpServletRequest http) {
    this.service = service;
    this.customer = customer;
    this.http = http;
  }

  private void query() {
    if (!http.getParameterMap().isEmpty())
      throw new ApplicationFailure(ApplicationFailure.Code.INVALID_REQUEST);
  }

  public ResponseEntity<ProductApplicationsResponse> listProductApplications() {
    query();
    return ResponseEntity.ok(
        new ProductApplicationsResponse(
            service.list(customer.current()).stream().map(ApplicationController::wire).toList()));
  }

  public ResponseEntity<com.asterbank.contract.customer.model.ProductApplication>
      getProductApplication(String id) {
    query();
    return ResponseEntity.ok(wire(service.detail(customer.current(), id)));
  }

  public ResponseEntity<com.asterbank.contract.customer.model.ProductApplication>
      submitProductApplication(String key, SubmitProductApplicationRequest r) {
    query();
    return ResponseEntity.status(201)
        .body(
            wire(
                service.submit(
                    customer.current(),
                    new ApplicationRequest(
                        r.getProductId(),
                        r.getAccountId(),
                        r.getContactEmail(),
                        Boolean.TRUE.equals(r.getConsent()),
                        money(r.getMonthlyIncome()),
                        money(r.getRequestedAmount()),
                        r.getTermMonths() == null ? null : r.getTermMonths().getValue(),
                        r.getPurpose() == null ? null : r.getPurpose().toString(),
                        details(r.getApplicationDetails())),
                    key,
                    http.getSession(false).getId(),
                    r.getIntentId(),
                    r.getIntentHash(),
                    r.getActionAuthorizationId(),
                    org.slf4j.MDC.get("correlationId"))));
  }

  public ResponseEntity<com.asterbank.contract.customer.model.ApplicationIntent>
      prepareApplicationIntent(PrepareApplicationIntentRequest r) {
    query();
    var i =
        service.prepare(
            customer.current(),
            http.getSession(false).getId(),
            new ApplicationRequest(
                r.getProductId(),
                r.getAccountId(),
                r.getContactEmail(),
                Boolean.TRUE.equals(r.getConsent()),
                money(r.getMonthlyIncome()),
                money(r.getRequestedAmount()),
                r.getTermMonths() == null ? null : r.getTermMonths().getValue(),
                r.getPurpose() == null ? null : r.getPurpose().toString(),
                details(r.getApplicationDetails())));
    return ResponseEntity.ok(
        new com.asterbank.contract.customer.model.ApplicationIntent(
            i.id(),
            i.hash(),
            VerificationAction.fromValue(i.action().name()),
            VerificationRequirement.fromValue(
                com.asterbank.banking.security.domain.VerificationPolicy.resolve(i.action())
                    .name()),
            i.expiresAt().toString(),
            r));
  }

  public ResponseEntity<Void> cancelApplicationIntent(String intentId) {
    query();
    service.cancel(customer.current(), http.getSession(false).getId(), intentId);
    return ResponseEntity.noContent().build();
  }

  private static com.asterbank.banking.shared.domain.Money money(Money m) {
    if (m == null) return null;
    try {
      return com.asterbank.banking.shared.domain.Money.of(
          m.getAmount(), m.getCurrency().toString());
    } catch (RuntimeException e) {
      throw new ApplicationFailure(ApplicationFailure.Code.INVALID_REQUEST);
    }
  }

  private static ApplicationDetails details(ProductApplicationDetails d) {
    if (d == null) return null;
    return new ApplicationDetails(
        d.getCardUsage() == null ? null : d.getCardUsage().toString(),
        d.getEmploymentStatus() == null ? null : d.getEmploymentStatus().toString(),
        d.getSavingsGoal() == null ? null : d.getSavingsGoal().toString(),
        money(d.getPlannedMonthlyContribution()),
        money(d.getCoverageAmount()),
        d.getBeneficiaryRelationship() == null ? null : d.getBeneficiaryRelationship().toString(),
        d.getHouseholdSize(),
        d.getTripStartDate(),
        d.getTripEndDate(),
        d.getPropertyType() == null ? null : d.getPropertyType().toString());
  }

  private static ProductApplicationDetails wireDetails(ApplicationDetails d) {
    if (d == null) return null;
    var w = new ProductApplicationDetails();
    if (d.cardUsage() != null)
      w.cardUsage(ProductApplicationDetails.CardUsageEnum.fromValue(d.cardUsage()));
    if (d.employmentStatus() != null)
      w.employmentStatus(
          ProductApplicationDetails.EmploymentStatusEnum.fromValue(d.employmentStatus()));
    if (d.savingsGoal() != null)
      w.savingsGoal(ProductApplicationDetails.SavingsGoalEnum.fromValue(d.savingsGoal()));
    if (d.plannedMonthlyContribution() != null)
      w.plannedMonthlyContribution(
          new Money(d.plannedMonthlyContribution().decimal(), Money.CurrencyEnum.CNY));
    if (d.coverageAmount() != null)
      w.coverageAmount(new Money(d.coverageAmount().decimal(), Money.CurrencyEnum.CNY));
    if (d.beneficiaryRelationship() != null)
      w.beneficiaryRelationship(
          ProductApplicationDetails.BeneficiaryRelationshipEnum.fromValue(
              d.beneficiaryRelationship()));
    if (d.householdSize() != null) w.householdSize(d.householdSize());
    if (d.tripStartDate() != null) w.tripStartDate(d.tripStartDate());
    if (d.tripEndDate() != null) w.tripEndDate(d.tripEndDate());
    if (d.propertyType() != null)
      w.propertyType(ProductApplicationDetails.PropertyTypeEnum.fromValue(d.propertyType()));
    return w;
  }

  private static com.asterbank.contract.customer.model.ProductApplication wire(
      com.asterbank.banking.customer.applicationrequest.domain.ProductApplication a) {
    var r = a.request();
    var w =
        new com.asterbank.contract.customer.model.ProductApplication()
            .id(a.id())
            .productId(r.productId())
            .productTitle(a.productTitle())
            .productType(
                com.asterbank.contract.customer.model.ProductApplication.ProductTypeEnum.fromValue(
                    a.productType()))
            .accountId(r.accountId())
            .maskedAccountNumber(a.maskedAccountNumber())
            .contactEmail(r.contactEmail())
            .status(com.asterbank.contract.customer.model.ProductApplication.StatusEnum.SUBMITTED)
            .submittedAt(a.submittedAt().toString());
    if (r.monthlyIncome() != null)
      w.monthlyIncome(new Money(r.monthlyIncome().decimal(), Money.CurrencyEnum.CNY));
    if (r.requestedAmount() != null)
      w.requestedAmount(new Money(r.requestedAmount().decimal(), Money.CurrencyEnum.CNY));
    if (r.termMonths() != null) w.termMonths(r.termMonths());
    if (r.purpose() != null)
      w.purpose(
          com.asterbank.contract.customer.model.ProductApplication.PurposeEnum.fromValue(
              r.purpose()));
    if (r.applicationDetails() != null) w.applicationDetails(wireDetails(r.applicationDetails()));
    return w;
  }
}
