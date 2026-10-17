package com.asterbank.banking.customer.recurring.adapter.persistence;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/** Opt-in, bank-owned reminder scheduling. Only in-app notifications are created. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@Profile("!test & !unit")
@ConditionalOnProperty(name = "aster.reminders.worker.enabled", havingValue = "true")
public class RenewalReminderPollingConfiguration {
  @Bean
  Worker renewalReminderWorker(RenewalReminderService service) {
    return new Worker(service);
  }

  public static final class Worker {
    private static final Logger LOG = LoggerFactory.getLogger(Worker.class);
    private final RenewalReminderService service;

    public Worker(RenewalReminderService service) {
      this.service = service;
    }

    @Scheduled(
        fixedDelayString = "${aster.reminders.worker.fixed-delay-ms:30000}",
        initialDelayString = "${aster.reminders.worker.initial-delay-ms:30000}")
    public void poll() {
      try {
        service.processDue();
      } catch (RuntimeException failure) {
        LOG.error("Renewal reminder poll failed: {}", failure.getClass().getName());
      }
    }
  }
}
