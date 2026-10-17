package com.asterbank.banking.customer.overview.adapter.web;

import com.asterbank.banking.customer.overview.application.OverviewQueryService;
import com.asterbank.banking.shared.security.CurrentCustomerProvider;
import com.asterbank.contract.customer.api.GetOverviewApi;
import com.asterbank.contract.customer.model.Overview;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!unit")
public class OverviewController implements GetOverviewApi {
  private final OverviewQueryService service;
  private final CurrentCustomerProvider customer;

  public OverviewController(OverviewQueryService service, CurrentCustomerProvider customer) {
    this.service = service;
    this.customer = customer;
  }

  public ResponseEntity<Overview> getOverview() {
    return ResponseEntity.ok(OverviewMapper.map(service.query(customer.current())));
  }
}
