package com.asterbank.banking.customer.spending.adapter.web;

import com.asterbank.banking.customer.spending.application.*;
import com.asterbank.banking.shared.security.CurrentCustomerProvider;
import com.asterbank.contract.customer.api.GetSpendingSummaryApi;
import com.asterbank.contract.customer.model.SpendingSummary;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!unit")
public class SpendingController implements GetSpendingSummaryApi {
  private final SpendingQueryService service;
  private final CurrentCustomerProvider customer;
  private final HttpServletRequest request;

  public SpendingController(
      SpendingQueryService service, CurrentCustomerProvider customer, HttpServletRequest request) {
    this.service = service;
    this.customer = customer;
    this.request = request;
  }

  public ResponseEntity<SpendingSummary> getSpendingSummary(
      String from, String to, String compareFrom, String compareTo, String accountId) {
    var q = new HashMap<String, String>();
    request
        .getParameterMap()
        .forEach(
            (k, v) -> {
              if (!Set.of("from", "to", "compareFrom", "compareTo", "accountId").contains(k)
                  || v.length != 1
                  || v[0].isEmpty()) throw new SpendingFailure(SpendingFailure.Code.INVALID_QUERY);
              q.put(k, v[0]);
            });
    return ResponseEntity.ok(SpendingMapper.summary(service.query(customer.current(), q)));
  }
}
