package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;

import com.asterbank.banking.shared.web.PersistenceAvailabilityFilter;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.transaction.CannotCreateTransactionException;
import tools.jackson.databind.json.JsonMapper;

class PersistenceAvailabilityFilterTest {
  private final PersistenceAvailabilityFilter filter =
      new PersistenceAvailabilityFilter(JsonMapper.builder().build());

  @ParameterizedTest
  @CsvSource({
    "/customer/accounts,500,PERSISTENCE_UNAVAILABLE",
    "/public/rates,500,PUBLIC_CONTENT_UNAVAILABLE",
    "/actuator/health,503,DOWN"
  })
  void sanitizesRepositoryFailureBeforeMvc(String path, int status, String code) throws Exception {
    var request = new MockHttpServletRequest("GET", path);
    var response = new MockHttpServletResponse();
    response.setHeader("X-Correlation-Id", "test-correlation");
    filter.doFilter(
        request,
        response,
        (req, res) -> {
          throw new CannotCreateTransactionException("jdbc:secret password=do-not-log");
        });
    assertThat(response.getStatus()).isEqualTo(status);
    assertThat(response.getContentAsString())
        .contains(code)
        .doesNotContain("jdbc:", "password", "Exception");
    assertThat(response.getHeader("X-Correlation-Id")).isEqualTo("test-correlation");
    assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
  }

  @Test
  void doesNotDisguiseUnrelatedFailuresAsDatabaseOutages() {
    assertThatThrownBy(
            () ->
                filter.doFilter(
                    new MockHttpServletRequest(),
                    new MockHttpServletResponse(),
                    (req, res) -> {
                      throw new IllegalArgumentException("unrelated");
                    }))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
