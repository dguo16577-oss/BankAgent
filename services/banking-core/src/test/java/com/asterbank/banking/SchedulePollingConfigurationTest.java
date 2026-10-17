package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.asterbank.banking.customer.payment.adapter.persistence.SchedulePollingConfiguration;
import com.asterbank.banking.customer.payment.application.ScheduledPaymentService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class SchedulePollingConfigurationTest {
  private final ApplicationContextRunner contexts =
      new ApplicationContextRunner()
          .withBean(ScheduledPaymentService.class, () -> mock(ScheduledPaymentService.class))
          .withUserConfiguration(SchedulePollingConfiguration.class);

  @Test
  void pollerRequiresExplicitOptInAndIsExcludedFromTests() {
    contexts.run(
        context -> assertThat(context).doesNotHaveBean(SchedulePollingConfiguration.Worker.class));
    contexts
        .withPropertyValues("aster.schedules.worker.enabled=true")
        .run(
            context ->
                assertThat(context).hasSingleBean(SchedulePollingConfiguration.Worker.class));
    contexts
        .withPropertyValues("aster.schedules.worker.enabled=true")
        .withInitializer(context -> context.getEnvironment().setActiveProfiles("test"))
        .run(
            context ->
                assertThat(context).doesNotHaveBean(SchedulePollingConfiguration.Worker.class));
  }

  @Test
  void databaseFailureDoesNotStopTheNextPollingAttempt() {
    var service = mock(ScheduledPaymentService.class);
    when(service.processDue())
        .thenThrow(new IllegalStateException("private bank detail"))
        .thenReturn(1);
    var worker = new SchedulePollingConfiguration.Worker(service);
    assertThatCode(worker::poll).doesNotThrowAnyException();
    worker.poll();
    verify(service, times(2)).processDue();
  }

  @Test
  void enabledPollerRunsWithoutAnOperatorRequest() {
    var service = mock(ScheduledPaymentService.class);
    new ApplicationContextRunner()
        .withBean(ScheduledPaymentService.class, () -> service)
        .withUserConfiguration(SchedulePollingConfiguration.class)
        .withPropertyValues(
            "aster.schedules.worker.enabled=true",
            "aster.schedules.worker.initial-delay-ms=10",
            "aster.schedules.worker.fixed-delay-ms=50")
        .run(
            context -> {
              assertThat(context).hasSingleBean(SchedulePollingConfiguration.Worker.class);
              verify(service, timeout(2000).atLeastOnce()).processDue();
            });
  }
}
