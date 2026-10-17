package com.asterbank.banking.security.adapter.web;

import com.asterbank.banking.security.application.SecurityFailure;
import com.asterbank.contract.customer.model.ApiError;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
@Order(-25)
public class ActionVerificationExceptionAdvice {
  @ExceptionHandler(SecurityFailure.class)
  ResponseEntity<ApiError> failure(SecurityFailure failure) {
    return ResponseEntity.status(failure.status())
        .body(
            new ApiError(
                ApiError.CodeEnum.fromValue(failure.code()), "Action verification rejected."));
  }
}
