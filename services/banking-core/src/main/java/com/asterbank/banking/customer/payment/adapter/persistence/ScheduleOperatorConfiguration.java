package com.asterbank.banking.customer.payment.adapter.persistence;

import com.asterbank.banking.customer.payment.application.ScheduledPaymentService;
import java.time.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.*;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;

/** Explicit local/test operator invocation, without an HTTP or Agent capability. */
@Configuration(proxyBeanMethods = false)
@Profile("(local | test) & !prod & !unit")
@ConditionalOnProperty(name = "aster.schedules.run-once", havingValue = "true")
public class ScheduleOperatorConfiguration {
  @Bean
  @Primary
  Clock scheduleOperatorClock(Environment env) {
    var at = env.getProperty("aster.schedules.at");
    return at == null
        ? Clock.systemUTC()
        : Clock.fixed(OffsetDateTime.parse(at).toInstant(), ZoneOffset.UTC);
  }

  @Bean
  Operator scheduleOperator(
      ScheduledPaymentService service, ConfigurableApplicationContext context) {
    return new Operator(service, context);
  }

  public record Operator(ScheduledPaymentService service, ConfigurableApplicationContext context) {
    @EventListener(ApplicationReadyEvent.class)
    public void run() {
      try {
        service.processDue();
      } finally {
        context.close();
      }
    }
  }
}
