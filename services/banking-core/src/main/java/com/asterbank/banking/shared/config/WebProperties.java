package com.asterbank.banking.shared.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("aster.web")
public record WebProperties(List<String> allowedOrigins) {
  public WebProperties {
    allowedOrigins = allowedOrigins == null ? List.of() : List.copyOf(allowedOrigins);
    if (allowedOrigins.stream().anyMatch(origin -> origin.contains("*"))) {
      throw new IllegalArgumentException("CORS origins must be explicit, without wildcards");
    }
  }
}
