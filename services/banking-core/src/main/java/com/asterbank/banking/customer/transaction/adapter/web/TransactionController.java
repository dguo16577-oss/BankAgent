package com.asterbank.banking.customer.transaction.adapter.web;

import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.customer.transaction.application.*;
import com.asterbank.banking.customer.transaction.domain.TransactionId;
import com.asterbank.banking.shared.domain.CardId;
import com.asterbank.banking.shared.security.CurrentCustomerProvider;
import com.asterbank.banking.shared.web.ReadModelMapper;
import com.asterbank.contract.customer.api.*;
import com.asterbank.contract.customer.model.*;
import java.time.OffsetDateTime;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TransactionController implements ListTransactionsApi, GetTransactionApi {
  private final TransactionQueryService service;
  private final CurrentCustomerProvider customer;

  public TransactionController(TransactionQueryService service, CurrentCustomerProvider customer) {
    this.service = service;
    this.customer = customer;
  }

  @Override
  public ResponseEntity<TransactionDetail> getTransaction(String id) {
    TransactionId transactionId;
    try {
      transactionId = new TransactionId(id);
    } catch (IllegalArgumentException invalid) {
      throw new TransactionNotFound();
    }
    return ResponseEntity.ok(
        ReadModelMapper.transactionDetail(service.detail(customer.current(), transactionId)));
  }

  @Override
  public ResponseEntity<com.asterbank.contract.customer.model.TransactionPage> listTransactions(
      String accountId,
      String from,
      String to,
      TransactionStatus status,
      TransactionDirection direction,
      TransactionType type,
      TransactionCategory category,
      String search,
      String cursor,
      Integer limit,
      String cardId) {
    TransactionFilter filter;
    try {
      filter =
          new TransactionFilter(
              empty(accountId) ? null : new AccountId(accountId),
              empty(cardId) ? null : new CardId(cardId),
              empty(from) ? null : OffsetDateTime.parse(from),
              empty(to) ? null : OffsetDateTime.parse(to),
              status == null
                  ? null
                  : com.asterbank.banking.customer.transaction.domain.TransactionStatus.valueOf(
                      status.getValue()),
              direction == null
                  ? null
                  : com.asterbank.banking.customer.transaction.domain.TransactionDirection.valueOf(
                      direction.getValue()),
              type == null
                  ? null
                  : com.asterbank.banking.customer.transaction.domain.TransactionType.valueOf(
                      type.getValue()),
              category == null
                  ? null
                  : com.asterbank.banking.customer.transaction.domain.TransactionCategory.valueOf(
                      category.getValue()),
              search,
              limit == null ? 10 : limit);
    } catch (IllegalArgumentException | java.time.DateTimeException exception) {
      throw new InvalidQuery();
    }
    return ResponseEntity.ok(
        ReadModelMapper.page(
            service.list(customer.current(), filter, empty(cursor) ? null : cursor)));
  }

  private static boolean empty(String value) {
    return value == null || value.isEmpty();
  }
}
