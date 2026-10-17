package com.asterbank.banking.shared.config;

import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;

/** Deployment inputs are checked before a datasource or seed can be instantiated. */
@Configuration(proxyBeanMethods = false)
@Profile("prod | demo")
public class DeploymentConfiguration {
  @Bean
  static BeanFactoryPostProcessor deploymentInputs(Environment env) {
    return beans -> {
      if (env.matchesProfiles("prod")
          && env.matchesProfiles("local", "test", "demo", "e2e", "unit"))
        throw new IllegalStateException(
            "prod cannot be combined with demo or development profiles");
      for (String name : new String[] {"DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"}) {
        String value = env.getProperty(name);
        if (value == null || value.isBlank() || value.equals("CHANGE_ME"))
          throw new IllegalStateException(
              "Required deployment variable missing or placeholder: " + name);
      }
    };
  }
}
