package com.asterbank.banking.customer.recurring.adapter.web;

import com.asterbank.banking.customer.recurring.domain.RecurringFailure;
import com.asterbank.contract.customer.model.ApiError;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(assignableTypes = RecurringController.class)
@Order(-30)
public class RecurringExceptionAdvice {
  @ExceptionHandler(RecurringFailure.class)
  ResponseEntity<ApiError> failure(RecurringFailure f) {
    int status =
        switch (f.code()) {
          case RECURRING_PAYMENT_NOT_FOUND,
              RECURRING_PAYMENT_INTENT_NOT_FOUND,
              RECURRING_PAYMENT_ACTION_NOT_FOUND ->
              404;
          case RECURRING_PAYMENT_NOT_MANAGEABLE -> 422;
          case INVALID_REQUEST -> 400;
          case PERSISTENCE_UNAVAILABLE -> 500;
          default -> 409;
        };
    return error(status, f.code().name());
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
                ApiError.CodeEnum.fromValue(code), "Recurring request could not be completed."));
  }
}
