package com.asterbank.banking;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;

class LocalCorsTest {
  static FoundationTestContext runtime;
  static MockMvc mvc;

  @BeforeAll
  static void start() {
    runtime = new FoundationTestContext(new String[] {"test", "local"});
    mvc = runtime.mvc;
  }

  @AfterAll
  static void stop() {
    if (runtime != null) runtime.close();
  }

  @Test
  void explicitLocalOriginCanPreflightWithoutAuthenticatingCustomer() throws Exception {
    mvc.perform(
            options("/customer/accounts")
                .header("Origin", "http://localhost:3000")
                .header("Access-Control-Request-Method", "GET")
                .header("Access-Control-Request-Headers", "X-Correlation-Id"))
        .andExpect(status().isOk())
        .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3000"))
        .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
  }

  @Test
  void unapprovedOriginIsRejected() throws Exception {
    mvc.perform(
            options("/public/home")
                .header("Origin", "https://unapproved.example")
                .header("Access-Control-Request-Method", "GET"))
        .andExpect(status().isForbidden())
        .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
  }
}
