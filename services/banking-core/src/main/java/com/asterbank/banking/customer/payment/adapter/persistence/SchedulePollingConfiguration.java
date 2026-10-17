package com.asterbank.banking.customer.payment.adapter.persistence;

import com.asterbank.banking.customer.payment.application.ScheduledPaymentService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/** Opt-in poller for durable bank-owned schedules; never an Agent or Customer API. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@Profile("!test & !unit")
@ConditionalOnProperty(name = "aster.schedules.worker.enabled", havingValue = "true")
public class SchedulePollingConfiguration {
  @Bean
  Worker scheduleWorker(ScheduledPaymentService service) {
    return new Worker(service);
  }

  public static final class Worker {
    private static final Logger LOG = LoggerFactory.getLogger(Worker.class);
    private final ScheduledPaymentService service;

    public Worker(ScheduledPaymentService service) {
      this.service = service;
    }

    @Scheduled(
        fixedDelayString = "${aster.schedules.worker.fixed-delay-ms:30000}",
        initialDelayString = "${aster.schedules.worker.initial-delay-ms:30000}")
    public void poll() {
      try {
        service.processDue();
      } catch (RuntimeException failure) {
        // A failed PostgreSQL transaction rolls back; the next poll can retry it.
        // Do not log exception messages because they may contain customer data.
        LOG.error("Scheduled payment poll failed: {}", failure.getClass().getName());
      }
    }
  }
}
