package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;

import com.asterbank.banking.shared.web.CorrelationIdFilter;
import jakarta.servlet.ServletException;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class CorrelationIdFilterTest {
  private final CorrelationIdFilter filter = new CorrelationIdFilter();

  @Test
  void generatesUuidAndCleansMdcBetweenRequests() throws Exception {
    var first = new MockHttpServletResponse();
    filter.doFilter(
        new MockHttpServletRequest(),
        first,
        (request, response) ->
            assertThat(MDC.get("correlationId"))
                .isEqualTo(first.getHeader(CorrelationIdFilter.HEADER)));
    assertThat(UUID.fromString(first.getHeader(CorrelationIdFilter.HEADER))).isNotNull();
    assertThat(MDC.get("correlationId")).isNull();
    var second = new MockHttpServletResponse();
    filter.doFilter(new MockHttpServletRequest(), second, (request, response) -> {});
    assertThat(second.getHeader(CorrelationIdFilter.HEADER))
        .isNotEqualTo(first.getHeader(CorrelationIdFilter.HEADER));
    assertThat(MDC.get("correlationId")).isNull();
  }

  @Test
  void validIdSurvivesAndMdcIsCleanEvenAfterException() {
    var request = new MockHttpServletRequest();
    request.addHeader(CorrelationIdFilter.HEADER, "client-request_42.1");
    var response = new MockHttpServletResponse();
    assertThatThrownBy(
            () ->
                filter.doFilter(
                    request,
                    response,
                    (req, res) -> {
                      assertThat(MDC.get("correlationId")).isEqualTo("client-request_42.1");
                      throw new ServletException("test failure");
                    }))
        .isInstanceOf(ServletException.class);
    assertThat(response.getHeader(CorrelationIdFilter.HEADER)).isEqualTo("client-request_42.1");
    assertThat(MDC.get("correlationId")).isNull();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "",
        "contains spaces",
        "bad\r\ninjected",
        "<script>",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      })
  void unsafeIdsAreReplaced(String input) throws Exception {
    var request = new MockHttpServletRequest();
    request.addHeader(CorrelationIdFilter.HEADER, input);
    var response = new MockHttpServletResponse();
    filter.doFilter(request, response, (req, res) -> {});
    assertThat(UUID.fromString(response.getHeader(CorrelationIdFilter.HEADER))).isNotNull();
    assertThat(response.getHeader(CorrelationIdFilter.HEADER)).isNotEqualTo(input);
    assertThat(MDC.get("correlationId")).isNull();
  }
}
