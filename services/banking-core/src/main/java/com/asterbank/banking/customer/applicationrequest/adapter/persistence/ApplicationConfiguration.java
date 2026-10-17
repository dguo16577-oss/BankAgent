package com.asterbank.banking.customer.applicationrequest.adapter.persistence;

import com.asterbank.banking.customer.account.application.AccountRepository;
import com.asterbank.banking.customer.applicationrequest.application.*;
import com.asterbank.banking.customer.payment.application.IdGenerator;
import java.time.Clock;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods = false)
@Profile("!unit")
public class ApplicationConfiguration {
  @Bean
  ApplicationStore applicationStore(
      JdbcTemplate db, PlatformTransactionManager tx, tools.jackson.databind.ObjectMapper mapper) {
    return new JdbcApplicationStore(db, tx, mapper);
  }

  @Bean
  ApplicationService applicationService(
      ApplicationStore store,
      AccountRepository accounts,
      IdGenerator ids,
      Clock clock,
      com.asterbank.banking.security.application.ActionAuthorizationService grants) {
    return new ApplicationService(store, accounts, ids, clock).withAuthorizations(grants);
  }
}
