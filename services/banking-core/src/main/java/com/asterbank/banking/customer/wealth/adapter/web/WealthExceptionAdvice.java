package com.asterbank.banking.customer.wealth.adapter.web;

import com.asterbank.banking.customer.wealth.domain.WealthFailure;
import com.asterbank.contract.customer.model.ApiError;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(assignableTypes = WealthController.class)
@Order(-30)
public class WealthExceptionAdvice {
  @ExceptionHandler(WealthFailure.class)
  ResponseEntity<ApiError> failure(WealthFailure f) {
    int status =
        switch (f.code()) {
          case INVESTMENT_PRODUCT_NOT_FOUND,
              RISK_PROFILE_NOT_FOUND,
              SUITABILITY_CHECK_NOT_FOUND,
              INVESTMENT_INTENT_NOT_FOUND,
              REDEMPTION_INTENT_NOT_FOUND,
              HOLDING_NOT_FOUND,
              INVESTMENT_ORDER_NOT_FOUND,
              ACCOUNT_NOT_FOUND ->
              404;
          case INVESTMENT_PRODUCT_UNAVAILABLE,
              PRODUCT_NOT_SUITABLE,
              INVESTMENT_AMOUNT_BELOW_MINIMUM,
              INSUFFICIENT_FUNDS,
              CURRENCY_MISMATCH,
              INVALID_AMOUNT,
              ACCOUNT_NOT_ELIGIBLE ->
              422;
          case REDEMPTION_EXCEEDS_HOLDING -> 422;
          case INVALID_REQUEST, INVALID_QUERY -> 400;
          case PERSISTENCE_UNAVAILABLE -> 500;
          default -> 409;
        };
    return error(status, f.code().name());
  }

  @ExceptionHandler(
      org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class)
  ResponseEntity<ApiError> query(Exception ignored) {
    return error(400, "INVALID_QUERY");
  }

  @ExceptionHandler({
    org.springframework.http.converter.HttpMessageNotReadableException.class,
    org.springframework.web.bind.MethodArgumentNotValidException.class,
    org.springframework.web.bind.MissingRequestHeaderException.class,
    jakarta.validation.ConstraintViolationException.class,
    org.springframework.web.method.annotation.HandlerMethodValidationException.class
  })
  ResponseEntity<ApiError> invalid(Exception ignored) {
    return error(400, "INVALID_REQUEST");
  }

  private ResponseEntity<ApiError> error(int status, String code) {
    return ResponseEntity.status(status)
        .body(
            new ApiError(
                ApiError.CodeEnum.fromValue(code), "Investment request could not be completed."));
  }
}
