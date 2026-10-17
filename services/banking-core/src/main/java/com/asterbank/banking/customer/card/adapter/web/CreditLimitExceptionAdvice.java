package com.asterbank.banking.customer.card.adapter.web;

import com.asterbank.banking.customer.card.application.*;
import com.asterbank.banking.security.application.SecurityFailure;
import com.asterbank.contract.customer.model.ApiError;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(assignableTypes = CreditLimitController.class)
@Order(-30)
public class CreditLimitExceptionAdvice {
  @ExceptionHandler(CreditLimitFailure.class)
  ResponseEntity<ApiError> failure(CreditLimitFailure f) {
    int status =
        switch (f.code()) {
          case INVALID_REQUEST -> 400;
          case CREDIT_LIMIT_INTENT_NOT_FOUND, CREDIT_LIMIT_APPLICATION_NOT_FOUND -> 404;
          case CREDIT_LIMIT_NOT_ELIGIBLE -> 422;
          default -> 409;
        };
    return error(status, f.code().name());
  }

  @ExceptionHandler(com.asterbank.banking.customer.card.application.CardFailure.class)
  ResponseEntity<ApiError> card(com.asterbank.banking.customer.card.application.CardFailure f) {
    return error(f.code() == CardFailure.Code.CARD_NOT_FOUND ? 404 : 409, f.code().name());
  }

  @ExceptionHandler(SecurityFailure.class)
  ResponseEntity<ApiError> security(SecurityFailure f) {
    return error(f.status(), f.code());
  }

  @ExceptionHandler({
    org.springframework.http.converter.HttpMessageNotReadableException.class,
    org.springframework.web.bind.MethodArgumentNotValidException.class
  })
  ResponseEntity<ApiError> invalid(Exception ignored) {
    return error(400, "INVALID_REQUEST");
  }

  private ResponseEntity<ApiError> error(int status, String code) {
    return ResponseEntity.status(status)
        .body(
            new ApiError(
                ApiError.CodeEnum.fromValue(code), "Credit limit request could not be completed."));
  }
}
