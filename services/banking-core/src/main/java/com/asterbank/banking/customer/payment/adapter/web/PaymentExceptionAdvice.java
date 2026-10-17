package com.asterbank.banking.customer.payment.adapter.web;

import com.asterbank.banking.customer.payment.application.PaymentFailure;
import com.asterbank.contract.customer.model.ApiError;
import jakarta.validation.ConstraintViolationException;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.HandlerMethodValidationException;

@RestControllerAdvice(
    assignableTypes = {
      PaymentController.class,
      RecipientController.class,
      ScheduleController.class,
      SplitController.class
    })
@Order(-20)
public class PaymentExceptionAdvice {
  @ExceptionHandler(com.asterbank.banking.security.application.SecurityFailure.class)
  ResponseEntity<ApiError> authorization(
      com.asterbank.banking.security.application.SecurityFailure error) {
    return ResponseEntity.status(error.status())
        .body(
            new ApiError(ApiError.CodeEnum.fromValue(error.code()), "Security request rejected."));
  }

  @ExceptionHandler(PaymentFailure.class)
  ResponseEntity<ApiError> business(PaymentFailure error) {
    int status =
        switch (error.code()) {
          case SCHEDULE_NOT_FOUND,
              SCHEDULE_INTENT_NOT_FOUND,
              SPLIT_NOT_FOUND,
              SPLIT_INTENT_NOT_FOUND,
              ACCOUNT_NOT_FOUND,
              RECIPIENT_NOT_FOUND,
              RECIPIENT_INTENT_NOT_FOUND,
              TRANSFER_INTENT_NOT_FOUND,
              TRANSFER_NOT_FOUND ->
              404;
          case INVALID_REQUEST, INVALID_QUERY -> 400;
          case TRANSFER_SESSION_MISMATCH -> 403;
          case SCHEDULE_STATE_CHANGED,
              SPLIT_STATE_CHANGED,
              SPLIT_INTENT_UNAVAILABLE,
              SPLIT_INTENT_HASH_MISMATCH,
              SCHEDULE_ALREADY_DUE,
              SCHEDULE_INTENT_HASH_MISMATCH,
              SCHEDULE_INTENT_UNAVAILABLE,
              TRANSFER_INTENT_HASH_MISMATCH,
              TRANSFER_INTENT_ALREADY_EXECUTED,
              TRANSFER_INTENT_EXPIRED,
              TRANSFER_INTENT_CANCELLED,
              RECIPIENT_ALREADY_EXISTS,
              RECIPIENT_STATE_CHANGED,
              RECIPIENT_INTENT_EXPIRED,
              RECIPIENT_INTENT_ALREADY_EXECUTED,
              RECIPIENT_INTENT_HASH_MISMATCH,
              IDEMPOTENCY_KEY_REUSED ->
              409;
          case PERSISTENCE_UNAVAILABLE -> 500;
          default -> 422;
        };
    return ResponseEntity.status(status)
        .body(
            new ApiError(ApiError.CodeEnum.fromValue(error.code().name()), message(error.code())));
  }

  private String message(PaymentFailure.Code code) {
    return switch (code) {
      case ACCOUNT_NOT_FOUND -> "Source account not found.";
      case RECIPIENT_NOT_FOUND -> "Recipient not found.";
      case TRANSFER_INTENT_NOT_FOUND -> "Transfer intent not found.";
      case TRANSFER_NOT_FOUND -> "Transfer not found.";
      case PERSISTENCE_UNAVAILABLE ->
          "Transfer could not be committed; retry safely with the same key.";
      default -> "The transfer request cannot be completed: " + code.name() + ".";
    };
  }

  @ExceptionHandler({
    HttpMessageNotReadableException.class,
    MethodArgumentNotValidException.class,
    MissingRequestHeaderException.class,
    ConstraintViolationException.class,
    HandlerMethodValidationException.class
  })
  ResponseEntity<ApiError> transport(Exception error) {
    return ResponseEntity.badRequest()
        .body(new ApiError(ApiError.CodeEnum.INVALID_REQUEST, "Invalid transfer request."));
  }
}
