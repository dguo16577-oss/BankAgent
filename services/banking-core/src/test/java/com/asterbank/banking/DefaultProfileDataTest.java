package com.asterbank.banking;

import static org.assertj.core.api.Assertions.assertThat;

import com.asterbank.banking.shared.config.DemoSeed;
import org.junit.jupiter.api.Test;

class DefaultProfileDataTest {
  @Test
  void defaultRuntimeDoesNotLoadAnyDemoBankingData() {
    try (var runtime = new FoundationTestContext(new String[] {})) {
      var seed = runtime.context.getBean(DemoSeed.class);
      assertThat(seed.accounts()).isEmpty();
      assertThat(seed.transactions()).isEmpty();
      assertThat(
              runtime
                  .context
                  .getBean(
                      com.asterbank.banking.customer.payment.application.RecipientRepository.class)
                  .list(ReadDomainFixtures.ALEX))
          .isEmpty();
    }
  }
}
