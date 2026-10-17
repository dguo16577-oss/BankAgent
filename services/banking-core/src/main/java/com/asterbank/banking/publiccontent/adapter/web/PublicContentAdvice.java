package com.asterbank.banking.publiccontent.adapter.web;

import com.asterbank.banking.publiccontent.application.PublicContentFailure;
import com.asterbank.contract.publicapi.model.PublicApiError;
import jakarta.validation.ConstraintViolationException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.*;

@RestControllerAdvice(assignableTypes = PublicContentController.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public final class PublicContentAdvice {
  @ExceptionHandler(PublicContentFailure.class)
  ResponseEntity<PublicApiError> failure(PublicContentFailure error) {
    return ResponseEntity.status(error.status())
        .body(
            new PublicApiError(
                PublicApiError.CodeEnum.fromValue(error.code()), error.getMessage()));
  }

  @ExceptionHandler({
    MethodArgumentTypeMismatchException.class,
    HandlerMethodValidationException.class,
    ConstraintViolationException.class
  })
  ResponseEntity<PublicApiError> invalid(Exception ignored) {
    return ResponseEntity.badRequest()
        .body(
            new PublicApiError(
                PublicApiError.CodeEnum.INVALID_PUBLIC_QUERY, "Invalid public query."));
  }
}
