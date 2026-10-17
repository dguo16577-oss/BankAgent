package com.asterbank.banking.shared.web;

import com.asterbank.contract.customer.model.ApiError;
import com.asterbank.contract.publicapi.model.PublicApiError;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.util.DisconnectedClientHelper;

@RestControllerAdvice
public class UnexpectedExceptionAdvice {
  private static final Logger LOG = LoggerFactory.getLogger(UnexpectedExceptionAdvice.class);

  @ExceptionHandler(Exception.class)
  ResponseEntity<?> handle(Exception exception, HttpServletRequest request) {
    if (DisconnectedClientHelper.isClientDisconnectedException(exception)) {
      // Query cancellation/navigation can close the socket while JSON is being written.
      LOG.debug("Client disconnected before response completion");
      return ResponseEntity.noContent().build();
    }
    // Preserve framework 4xx statuses without echoing its diagnostic detail.
    if (exception instanceof ErrorResponse error) {
      return ResponseEntity.status(error.getStatusCode())
          .body(ProblemDetail.forStatus(error.getStatusCode()));
    }
    // Exception messages/stack traces may include secrets. Correlation is the diagnostic handle.
    LOG.error("Unexpected request failure type={}", exception.getClass().getSimpleName());
    Object body =
        request.getRequestURI().startsWith("/public/")
            ? new PublicApiError(
                PublicApiError.CodeEnum.PUBLIC_CONTENT_UNAVAILABLE,
                "Public content is temporarily unavailable.")
            : new ApiError(ApiError.CodeEnum.INTERNAL_ERROR, "An unexpected error occurred.");
    return ResponseEntity.internalServerError().body(body);
  }
}
