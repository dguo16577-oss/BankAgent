package com.asterbank.banking.shared.web;

import static org.assertj.core.api.Assertions.*;

import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.HttpMessageNotWritableException;
import org.springframework.mock.web.MockHttpServletRequest;

class UnexpectedExceptionAdviceTest {
  @Test
  void cancelledSocketIsNotReportedAsAnApplicationFailure() {
    var failure =
        new HttpMessageNotWritableException("response interrupted", new IOException("Broken pipe"));
    assertThat(
            new UnexpectedExceptionAdvice()
                .handle(failure, new MockHttpServletRequest())
                .getStatusCode()
                .value())
        .isEqualTo(204);
  }

  @Test
  void genuineSerializationFailureRemainsAnError() {
    var failure = new HttpMessageNotWritableException("cannot serialize secret internals");
    var response =
        new UnexpectedExceptionAdvice()
            .handle(failure, new MockHttpServletRequest("GET", "/customer/accounts"));
    assertThat(response.getStatusCode().value()).isEqualTo(500);
    assertThat(response.getBody().toString()).doesNotContain("secret", "serialize");
  }
}
