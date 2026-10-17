package com.asterbank.banking.customer.card.adapter.web;

import com.asterbank.banking.customer.card.application.CardFailure;
import com.asterbank.banking.customer.card.domain.CardRuleViolation;
import com.asterbank.banking.security.application.SecurityFailure;
import com.asterbank.contract.customer.model.ApiError;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(assignableTypes = CardController.class)
@Order(-30)
public class CardExceptionAdvice {
  @ExceptionHandler(CardFailure.class)
  ResponseEntity<ApiError> card(CardFailure f) {
    var code = f.code();
    int status =
        switch (code) {
          case CARD_NOT_FOUND, CARD_ACTION_INTENT_NOT_FOUND, CARD_ACTION_NOT_FOUND -> 404;
          case INVALID_REQUEST -> 400;
          case PERSISTENCE_UNAVAILABLE -> 500;
          default -> 409;
        };
    return error(status, code.name());
  }

  @ExceptionHandler(CardRuleViolation.class)
  ResponseEntity<ApiError> rule(CardRuleViolation f) {
    return error(
        f.code() == CardRuleViolation.Code.INVALID_REQUEST
            ? 400
            : f.code() == CardRuleViolation.Code.CARD_STATE_CHANGED ? 409 : 422,
        f.code().name());
  }

  @ExceptionHandler(SecurityFailure.class)
  ResponseEntity<ApiError> security(SecurityFailure f) {
    return error(f.status(), f.code());
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
                ApiError.CodeEnum.fromValue(code), "Card request could not be completed."));
  }
}
