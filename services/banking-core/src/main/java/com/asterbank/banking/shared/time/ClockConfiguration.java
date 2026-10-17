package com.asterbank.banking.shared.time;

import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class ClockConfiguration {
  @Bean
  @ConditionalOnMissingBean(Clock.class)
  Clock clock() {
    return Clock.systemUTC();
  }
}
