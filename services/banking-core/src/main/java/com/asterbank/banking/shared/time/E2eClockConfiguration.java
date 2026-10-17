package com.asterbank.banking.shared.time;

import java.time.*;
import org.springframework.context.annotation.*;

/** Fixed competition fixture time, enabled only for the isolated browser test runtime. */
@Configuration(proxyBeanMethods = false)
@Profile("e2e & (local | demo) & !prod")
public class E2eClockConfiguration {
  @Bean
  @Primary
  Clock e2eClock() {
    return Clock.fixed(Instant.parse("2026-09-27T02:30:00Z"), ZoneOffset.UTC);
  }
}
