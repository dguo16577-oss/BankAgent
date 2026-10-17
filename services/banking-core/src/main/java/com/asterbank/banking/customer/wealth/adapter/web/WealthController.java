package com.asterbank.banking.customer.wealth.adapter.web;

import com.asterbank.banking.customer.wealth.application.WealthService;
import com.asterbank.banking.customer.wealth.domain.InvestmentProduct;
import com.asterbank.banking.customer.wealth.domain.WealthFailure;
import com.asterbank.banking.shared.security.CurrentCustomerProvider;
import com.asterbank.contract.customer.api.*;
import com.asterbank.contract.customer.model.*;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!unit")
public class WealthController
    implements GetWealthPortfolioApi,
        ListInvestmentProductsApi,
        GetInvestmentProductApi,
        GetRiskProfileApi,
        CreateSuitabilityCheckApi,
        GetSuitabilityCheckApi,
        CreateInvestmentOrderIntentApi,
        GetInvestmentOrderIntentApi,
        CancelInvestmentOrderIntentApi,
        CreateInvestmentRedemptionIntentApi,
        GetInvestmentRedemptionIntentApi,
        CancelInvestmentRedemptionIntentApi,
        ExecuteInvestmentRedemptionApi,
        ExecuteInvestmentOrderApi,
        GetInvestmentOrderApi {
  private final WealthService service;
  private final CurrentCustomerProvider customer;
  private final HttpServletRequest request;

  public WealthController(
      WealthService service, CurrentCustomerProvider customer, HttpServletRequest request) {
    this.service = service;
    this.customer = customer;
    this.request = request;
  }

  private void query(String... names) {
    var allowed = Set.of(names);
    request
        .getParameterMap()
        .forEach(
            (k, v) -> {
              if (!allowed.contains(k) || v.length != 1 || v[0].isEmpty())
                throw new WealthFailure(WealthFailure.Code.INVALID_QUERY);
            });
  }

  public ResponseEntity<PortfolioSummary> getWealthPortfolio() {
    query();
    return ResponseEntity.ok(WealthMapper.portfolio(service.portfolio(customer.current())));
  }

  public ResponseEntity<InvestmentProductsResponse> listInvestmentProducts(
      InvestmentProductType type, RiskLevel riskLevel) {
    query("type", "riskLevel");
    return ResponseEntity.ok(
        new InvestmentProductsResponse(
            service
                .products(
                    type == null ? null : InvestmentProduct.Type.valueOf(type.name()),
                    riskLevel == null
                        ? null
                        : com.asterbank.banking.customer.wealth.domain.RiskLevel.valueOf(
                            riskLevel.name()))
                .stream()
                .map(WealthMapper::summary)
                .toList()));
  }

  public ResponseEntity<InvestmentProductDetail> getInvestmentProduct(String id) {
    query();
    return ResponseEntity.ok(WealthMapper.product(service.product(id)));
  }

  public ResponseEntity<UserRiskProfile> getRiskProfile() {
    query();
    return ResponseEntity.ok(WealthMapper.risk(service.risk(customer.current())));
  }

  public ResponseEntity<SuitabilityCheck> createSuitabilityCheck(CreateSuitabilityCheckRequest r) {
    query();
    return ResponseEntity.status(201)
        .body(WealthMapper.check(service.check(customer.current(), r.getProductId())));
  }

  public ResponseEntity<SuitabilityCheck> getSuitabilityCheck(String id) {
    query();
    return ResponseEntity.ok(WealthMapper.check(service.suitability(customer.current(), id)));
  }

  public ResponseEntity<InvestmentOrderIntent> createInvestmentOrderIntent(
      CreateInvestmentOrderIntentRequest r) {
    query();
    return ResponseEntity.status(201)
        .body(
            WealthMapper.intent(
                service.prepare(
                    customer.current(),
                    r.getProductId(),
                    r.getSourceAccountId(),
                    com.asterbank.banking.shared.domain.Money.of(
                        r.getAmount().getAmount(), r.getAmount().getCurrency().getValue()),
                    r.getSuitabilityCheckId())));
  }

  public ResponseEntity<InvestmentOrderIntent> getInvestmentOrderIntent(String id) {
    query();
    return ResponseEntity.ok(WealthMapper.intent(service.intent(customer.current(), id)));
  }

  public ResponseEntity<InvestmentOrderIntent> cancelInvestmentOrderIntent(String id) {
    query();
    return ResponseEntity.ok(WealthMapper.intent(service.cancel(customer.current(), id)));
  }

  public ResponseEntity<InvestmentRedemptionIntent> createInvestmentRedemptionIntent(
      CreateInvestmentRedemptionIntentRequest r) {
    query();
    return ResponseEntity.status(201)
        .body(
            WealthMapper.redemptionIntent(
                service.prepareRedemption(
                    customer.current(),
                    r.getHoldingId(),
                    r.getDestinationAccountId(),
                    com.asterbank.banking.shared.domain.Money.of(
                        r.getAmount().getAmount(), r.getAmount().getCurrency().getValue()))));
  }

  public ResponseEntity<InvestmentRedemptionIntent> getInvestmentRedemptionIntent(String id) {
    query();
    return ResponseEntity.ok(
        WealthMapper.redemptionIntent(service.redemptionIntent(customer.current(), id)));
  }

  public ResponseEntity<InvestmentRedemptionIntent> cancelInvestmentRedemptionIntent(String id) {
    query();
    return ResponseEntity.ok(
        WealthMapper.redemptionIntent(service.cancelRedemption(customer.current(), id)));
  }

  public ResponseEntity<InvestmentRedemptionReceipt> executeInvestmentRedemption(
      String key, ExecuteInvestmentOrderRequest r) {
    query();
    return ResponseEntity.ok(
        WealthMapper.redemptionOrder(
            service.executeRedemption(
                customer.current(),
                r.getIntentId(),
                r.getIntentHash(),
                key,
                request.getSession(false).getId(),
                r.getActionAuthorizationId(),
                org.slf4j.MDC.get("correlationId"))));
  }

  public ResponseEntity<InvestmentOrderReceipt> executeInvestmentOrder(
      String key, ExecuteInvestmentOrderRequest r) {
    query();
    return ResponseEntity.ok(
        WealthMapper.order(
            service.execute(
                customer.current(),
                r.getIntentId(),
                r.getIntentHash(),
                key,
                request.getSession(false).getId(),
                r.getActionAuthorizationId(),
                org.slf4j.MDC.get("correlationId"))));
  }

  public ResponseEntity<InvestmentOrderReceipt> getInvestmentOrder(String id) {
    query();
    return ResponseEntity.ok(WealthMapper.order(service.order(customer.current(), id)));
  }
}
