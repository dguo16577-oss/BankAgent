package com.asterbank.banking.customer.overview.adapter.web;

import com.asterbank.contract.customer.model.ApiError;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(assignableTypes = OverviewController.class)
@Order(-30)
public class OverviewExceptionAdvice {
  @ExceptionHandler(RuntimeException.class)
  ResponseEntity<ApiError> unavailable(RuntimeException ignored) {
    return ResponseEntity.internalServerError()
        .body(
            new ApiError(
                ApiError.CodeEnum.PERSISTENCE_UNAVAILABLE,
                "Customer overview is temporarily unavailable."));
  }
}
