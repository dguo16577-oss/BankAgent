package com.asterbank.banking.customer.applicationrequest.adapter.web;

import com.asterbank.banking.customer.applicationrequest.domain.ApplicationFailure;
import com.asterbank.contract.customer.model.ApiError;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(assignableTypes = ApplicationController.class)
@Order(-30)
public class ApplicationExceptionAdvice {
  @ExceptionHandler(ApplicationFailure.class)
  ResponseEntity<ApiError> failure(ApplicationFailure f) {
    int status =
        switch (f.code()) {
          case APPLICATION_NOT_FOUND, ACCOUNT_NOT_FOUND -> 404;
          case PRODUCT_NOT_APPLICABLE -> 422;
          case INVALID_REQUEST -> 400;
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
                ApiError.CodeEnum.fromValue(code), "Application request could not be completed."));
  }
}
