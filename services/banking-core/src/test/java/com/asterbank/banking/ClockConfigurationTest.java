package com.asterbank.banking;

import static org.assertj.core.api.Assertions.assertThat;

import com.asterbank.banking.shared.time.ClockConfiguration;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class ClockConfigurationTest {
  private final ApplicationContextRunner runner =
      new ApplicationContextRunner().withUserConfiguration(ClockConfiguration.class);

  @Test
  void defaultClockIsUtcSystemClock() {
    runner.run(
        context -> {
          assertThat(context).hasSingleBean(Clock.class);
          assertThat(context.getBean(Clock.class)).isEqualTo(Clock.systemUTC());
        });
  }

  @Test
  void testCanSupplyDeterministicClock() {
    Clock fixed = Clock.fixed(Instant.parse("2026-09-27T02:30:00Z"), ZoneOffset.UTC);
    runner
        .withBean("fixedClock", Clock.class, () -> fixed)
        .run(
            context -> {
              assertThat(context).hasSingleBean(Clock.class);
              assertThat(context.getBean(Clock.class).instant()).isEqualTo(fixed.instant());
              assertThat(context.getBean(Clock.class)).isSameAs(fixed);
            });
  }
}
