package com.asterbank.banking.customer.spending.adapter.web;

import com.asterbank.banking.customer.spending.application.SpendingFailure;
import com.asterbank.contract.customer.model.ApiError;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(assignableTypes = SpendingController.class)
@Order(-30)
public class SpendingExceptionAdvice {
  @ExceptionHandler(SpendingFailure.class)
  ResponseEntity<ApiError> failure(SpendingFailure f) {
    return error(
        switch (f.code()) {
          case ACCOUNT_NOT_FOUND -> 404;
          case INVALID_QUERY -> 400;
          case PERSISTENCE_UNAVAILABLE -> 500;
        },
        f.code().name());
  }

  @ExceptionHandler({
    jakarta.validation.ConstraintViolationException.class,
    org.springframework.web.method.annotation.HandlerMethodValidationException.class,
    org.springframework.web.bind.MethodArgumentNotValidException.class
  })
  ResponseEntity<ApiError> invalid(Exception ignored) {
    return error(400, "INVALID_QUERY");
  }

  private ResponseEntity<ApiError> error(int status, String code) {
    return ResponseEntity.status(status)
        .body(
            new ApiError(
                ApiError.CodeEnum.fromValue(code), "Spending query could not be completed."));
  }
}
