package com.asterbank.banking;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;

import com.asterbank.banking.shared.web.CorrelationIdFilter;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/** Explicit lifecycle keeps the requested JUnit 5 baseline without Spring 7's JUnit 6 extension. */
final class FoundationTestContext implements AutoCloseable {
  final ConfigurableApplicationContext context;
  final MockMvc mvc;

  FoundationTestContext(String[] profiles, Class<?>... testSources) {
    context =
        new SpringApplicationBuilder(BankingCoreApplication.class)
            .sources(testSources)
            .profiles(
                java.util.stream.Stream.concat(
                        java.util.Arrays.stream(profiles), java.util.stream.Stream.of("unit"))
                    .toArray(String[]::new))
            .run("--server.port=0");
    mvc =
        MockMvcBuilders.webAppContextSetup((WebApplicationContext) context)
            .addFilters(context.getBean(CorrelationIdFilter.class))
            .apply(springSecurity())
            .build();
  }

  @Override
  public void close() {
    context.close();
  }
}
