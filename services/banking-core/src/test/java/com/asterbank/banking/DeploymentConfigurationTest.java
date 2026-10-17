package com.asterbank.banking;

import static org.assertj.core.api.Assertions.assertThat;

import com.asterbank.banking.shared.config.DeploymentConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class DeploymentConfigurationTest {
  private final ApplicationContextRunner context =
      new ApplicationContextRunner()
          .withUserConfiguration(DeploymentConfiguration.class)
          .withPropertyValues(
              "spring.profiles.active=prod", "DB_HOST=postgres", "DB_NAME=aster", "DB_USER=aster");

  @Test
  void missingPasswordFailsBeforeDatasource() {
    context.run(c -> assertThat(c).hasFailed());
  }

  @Test
  void placeholderPasswordFails() {
    context.withPropertyValues("DB_PASSWORD=CHANGE_ME").run(c -> assertThat(c).hasFailed());
  }

  @Test
  void validExplicitInputsPass() {
    context.withPropertyValues("DB_PASSWORD=test-only").run(c -> assertThat(c).hasNotFailed());
  }

  @Test
  void productionCannotEnableDemoSeedOrVerifier() {
    context
        .withPropertyValues("DB_PASSWORD=test-only", "spring.profiles.active=prod,demo")
        .run(c -> assertThat(c).hasFailed());
  }
}
