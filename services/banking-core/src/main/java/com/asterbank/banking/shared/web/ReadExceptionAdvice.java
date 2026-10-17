package com.asterbank.banking.shared.web;

import com.asterbank.banking.customer.account.application.AccountNotFound;
import com.asterbank.banking.customer.transaction.application.*;
import com.asterbank.contract.customer.model.ApiError;
import jakarta.validation.ConstraintViolationException;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
@Order(-10)
public class ReadExceptionAdvice {
  @ExceptionHandler(AccountNotFound.class)
  ResponseEntity<ApiError> account(AccountNotFound error) {
    return error(404, ApiError.CodeEnum.ACCOUNT_NOT_FOUND, error.getMessage());
  }

  @ExceptionHandler(TransactionNotFound.class)
  ResponseEntity<ApiError> transaction(TransactionNotFound error) {
    return error(404, ApiError.CodeEnum.TRANSACTION_NOT_FOUND, error.getMessage());
  }

  @ExceptionHandler(InvalidCursor.class)
  ResponseEntity<ApiError> cursor(InvalidCursor error) {
    return error(400, ApiError.CodeEnum.INVALID_CURSOR, error.getMessage());
  }

  @ExceptionHandler({
    InvalidQuery.class,
    MethodArgumentTypeMismatchException.class,
    HandlerMethodValidationException.class,
    ConstraintViolationException.class
  })
  ResponseEntity<ApiError> query(Exception ignored) {
    return error(400, ApiError.CodeEnum.INVALID_QUERY, "Invalid transaction query.");
  }

  private ResponseEntity<ApiError> error(int status, ApiError.CodeEnum code, String message) {
    return ResponseEntity.status(status).body(new ApiError(code, message));
  }
}
