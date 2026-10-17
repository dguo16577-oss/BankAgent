package com.asterbank.banking.customer.deposit.adapter.web;

import com.asterbank.banking.customer.account.application.AccountQueryService;
import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.customer.deposit.DepositFailure;
import com.asterbank.banking.customer.deposit.DepositService;
import com.asterbank.banking.security.application.VerificationFactors;
import com.asterbank.banking.shared.security.CurrentCustomerProvider;
import com.asterbank.banking.shared.web.ReadModelMapper;
import com.asterbank.contract.customer.api.*;
import com.asterbank.contract.customer.model.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!unit")
public class DepositController
    implements OpenCurrencyAccountApi, OpenTimeDepositApi, ListTimeDepositsApi {
  private final DepositService service;
  private final AccountQueryService accounts;
  private final CurrentCustomerProvider customer;
  private final VerificationFactors factors;

  public DepositController(
      DepositService service,
      AccountQueryService accounts,
      CurrentCustomerProvider customer,
      VerificationFactors factors) {
    this.service = service;
    this.accounts = accounts;
    this.customer = customer;
    this.factors = factors;
  }

  public ResponseEntity<AccountSummary> openCurrencyAccount(OpenCurrencyAccountRequest body) {
    if (body == null || body.getCurrency() == null)
      throw new DepositFailure("INVALID_REQUEST", 400);
    var owner = customer.current();
    String id = service.openCurrencyAccount(owner, body.getCurrency().getValue());
    return ResponseEntity.status(201)
        .body(ReadModelMapper.account(accounts.detail(owner, new AccountId(id)).account()));
  }

  public ResponseEntity<TimeDeposit> openTimeDeposit(String key, OpenTimeDepositRequest body) {
    var owner = customer.current();
    if (body == null || !Boolean.TRUE.equals(body.getConfirm()) || body.getPassword() == null)
      throw new DepositFailure("INVALID_REQUEST", 400);
    if (!factors.passwordMatches(owner.value(), body.getPassword()))
      throw new DepositFailure("INVALID_CREDENTIALS", 401);
    var result = service.openTimeDeposit(owner, body.getSourceAccountId(), body.getAmount(), key);
    return ResponseEntity.status(201).body(wire(result));
  }

  public ResponseEntity<TimeDepositsResponse> listTimeDeposits() {
    return ResponseEntity.ok(
        new TimeDepositsResponse()
            .items(
                service.list(customer.current()).stream().map(DepositController::wire).toList()));
  }

  private static TimeDeposit wire(DepositService.Holding h) {
    return new TimeDeposit()
        .id(h.id())
        .sourceAccountId(h.sourceAccountId())
        .depositAccountId(h.depositAccountId())
        .amount(new Money(h.amount().toPlainString(), Money.CurrencyEnum.CNY))
        .termMonths(TimeDeposit.TermMonthsEnum.NUMBER_12)
        .annualRate(h.annualRate().toPlainString())
        .openedAt(ReadModelMapper.time(h.openedAt()))
        .maturesAt(ReadModelMapper.time(h.maturesAt()))
        .status(TimeDeposit.StatusEnum.fromValue(h.status()));
  }

  @ExceptionHandler(DepositFailure.class)
  ResponseEntity<ApiError> failure(DepositFailure failure) {
    return ResponseEntity.status(failure.status())
        .body(new ApiError(ApiError.CodeEnum.fromValue(failure.code()), failure.getMessage()));
  }
}
