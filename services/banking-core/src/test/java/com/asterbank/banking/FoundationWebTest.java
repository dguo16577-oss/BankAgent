package com.asterbank.banking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.asterbank.banking.shared.web.CorrelationIdFilter;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

class FoundationWebTest {
  static FoundationTestContext runtime;
  static MockMvc mvc;
  static ApplicationContext context;

  @BeforeAll
  static void start() {
    runtime = new FoundationTestContext(new String[] {"test"}, FailureConfiguration.class);
    mvc = runtime.mvc;
    context = runtime.context;
  }

  @AfterAll
  static void stop() {
    if (runtime != null) runtime.close();
  }

  @Test
  void contextStartsWithoutDefaultDemoCredentials() {
    assertThat(context.getBeansOfType(UserDetailsService.class)).isEmpty();
  }

  @Test
  void healthIsMinimalAndInfoAccessible() throws Exception {
    mvc.perform(get("/actuator/health"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("UP"))
        .andExpect(jsonPath("$.components").doesNotExist())
        .andExpect(jsonPath("$.details").doesNotExist())
        .andExpect(header().exists(CorrelationIdFilter.HEADER));
    mvc.perform(get("/actuator/info")).andExpect(status().isOk());
  }

  @Test
  void publicUnknownIs404AndCustomerUnknownIsJson401() throws Exception {
    mvc.perform(get("/public/non-existent")).andExpect(status().isNotFound());
    mvc.perform(get("/customer/non-existent"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
        .andExpect(header().doesNotExist("Location"));
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "/unknown",
        "/login",
        "/actuator/env",
        "/actuator/beans",
        "/actuator/configprops",
        "/actuator/heapdump",
        "/admin/anything",
        "/internal/anything"
      })
  void unknownAndSensitiveEndpointsAreDeniedWithoutHtmlLogin(String path) throws Exception {
    mvc.perform(get(path))
        .andExpect(status().isUnauthorized())
        .andExpect(header().doesNotExist("Location"))
        .andExpect(content().contentTypeCompatibleWith("application/json"));
    mvc.perform(get(path).with(user("test-only"))).andExpect(status().isForbidden());
  }

  @Test
  void businessInterfacesHaveNoControllersAndCsrfRemainsEnabled() throws Exception {
    mvc.perform(get("/public/home")).andExpect(status().isNotFound());
    mvc.perform(get("/customer/overview").with(user("test-only"))).andExpect(status().isNotFound());
    mvc.perform(post("/customer/auth/login")).andExpect(status().isForbidden());
  }

  @Test
  void localhostIsNotAllowedOutsideLocalProfile() throws Exception {
    mvc.perform(
            options("/public/non-existent")
                .header("Origin", "http://localhost:3000")
                .header("Access-Control-Request-Method", "GET"))
        .andExpect(status().isForbidden())
        .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
  }

  @Test
  void unexpectedFailuresUseGeneratedSurfaceErrorsWithoutLeakingDetails() throws Exception {
    String publicBody =
        mvc.perform(get("/public/__foundation-test/failure"))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.code").value("PUBLIC_CONTENT_UNAVAILABLE"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    String customerBody =
        mvc.perform(get("/customer/__foundation-test/failure").with(user("test-only")))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(publicBody + customerBody)
        .doesNotContain(
            "IllegalStateException", "password", "SELECT", "C:\\", "stackTrace", "secret-marker");
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class FailureConfiguration {
    @Bean
    FailureController failureController() {
      return new FailureController();
    }
  }

  @RestController
  static class FailureController {
    @GetMapping({"/public/__foundation-test/failure", "/customer/__foundation-test/failure"})
    String fail() {
      throw new IllegalStateException("C:\\private SELECT password=secret-marker");
    }
  }
}
