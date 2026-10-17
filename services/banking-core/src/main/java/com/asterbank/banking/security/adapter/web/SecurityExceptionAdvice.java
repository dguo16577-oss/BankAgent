package com.asterbank.banking.security.adapter.web;

import com.asterbank.contract.customer.model.ApiError;
import jakarta.validation.ConstraintViolationException;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.HandlerMethodValidationException;

@RestControllerAdvice(assignableTypes = SecurityController.class)
@Order(-20)
public class SecurityExceptionAdvice {
  @ExceptionHandler({
    ConstraintViolationException.class,
    HttpMessageNotReadableException.class,
    MethodArgumentNotValidException.class,
    HandlerMethodValidationException.class
  })
  ResponseEntity<ApiError> invalid(Exception ignored) {
    return ResponseEntity.badRequest()
        .body(new ApiError(ApiError.CodeEnum.INVALID_REQUEST, "Invalid security request."));
  }
}
