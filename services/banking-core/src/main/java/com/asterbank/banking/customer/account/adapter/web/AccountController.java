package com.asterbank.banking.customer.account.adapter.web;

import com.asterbank.banking.customer.account.application.AccountQueryService;
import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.shared.security.CurrentCustomerProvider;
import com.asterbank.banking.shared.web.ReadModelMapper;
import com.asterbank.contract.customer.api.*;
import com.asterbank.contract.customer.model.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AccountController implements ListAccountsApi, GetAccountApi {
  private final AccountQueryService service;
  private final CurrentCustomerProvider customer;

  public AccountController(AccountQueryService service, CurrentCustomerProvider customer) {
    this.service = service;
    this.customer = customer;
  }

  @Override
  public ResponseEntity<AccountsResponse> listAccounts() {
    return ResponseEntity.ok(ReadModelMapper.accounts(service.list(customer.current())));
  }

  @Override
  public ResponseEntity<AccountDetail> getAccount(String id) {
    AccountId accountId;
    try {
      accountId = new AccountId(id);
    } catch (IllegalArgumentException invalid) {
      throw new com.asterbank.banking.customer.account.application.AccountNotFound();
    }
    return ResponseEntity.ok(
        ReadModelMapper.accountDetail(service.detail(customer.current(), accountId)));
  }
}
