package com.asterbank.banking.publiccontent.adapter.persistence;

import com.asterbank.banking.publiccontent.application.*;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
@Profile("!unit")
public class PublicContentConfiguration {
  @Bean
  PublicContentRepository publicContentRepository(
      JdbcTemplate sql, ObjectMapper json, PlatformTransactionManager tx) {
    return new PostgreSqlPublicContent(sql, json, tx);
  }

  @Bean
  PublicContentService publicContentService(PublicContentRepository repository) {
    return new PublicContentService(repository);
  }

  @Bean
  @Profile("(local | test | demo) & !prod")
  DemoPublicContentSeed demoPublicContentSeed(JdbcTemplate sql, PlatformTransactionManager tx) {
    return new DemoPublicContentSeed(sql, tx);
  }

  @Bean
  @Profile("(local | test | demo) & !prod")
  ApplicationRunner seedPublicContent(DemoPublicContentSeed seed) {
    return args -> seed.initialize();
  }
}
