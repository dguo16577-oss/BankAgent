package com.asterbank.banking.security.adapter.security;

import com.asterbank.banking.security.adapter.persistence.JdbcSecurityStore;
import com.asterbank.banking.security.application.*;
import java.time.*;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.*;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.session.*;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.*;
import org.springframework.session.jdbc.config.annotation.web.http.EnableJdbcHttpSession;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods = false)
@Profile("!unit")
@EnableJdbcHttpSession(maxInactiveIntervalInSeconds = 3600)
public class PersistentSecurityConfiguration {
  @Bean
  org.springframework.session.config.SessionRepositoryCustomizer<
          org.springframework.session.jdbc.JdbcIndexedSessionRepository>
      sessionTimeout(@Value("${aster.security.session-timeout:PT1H}") Duration timeout) {
    return repository -> repository.setDefaultMaxInactiveInterval(timeout);
  }

  @Bean
  PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder(12);
  }

  @Bean
  SecurityStore securityStore(JdbcTemplate db, PlatformTransactionManager tx) {
    return new JdbcSecurityStore(db, tx);
  }

  @Bean
  OtpGenerator otpGenerator() {
    return new SecureRandomOtpGenerator();
  }

  @Bean
  SmsSender smsSender(JdbcTemplate db, org.springframework.core.env.Environment env) {
    boolean enabled = env.matchesProfiles("local", "test", "demo") && !env.matchesProfiles("prod");
    boolean inbox = env.matchesProfiles("demo") && !env.matchesProfiles("prod");
    return new com.asterbank.banking.security.adapter.persistence.DatabaseDemoSmsSender(
        db, enabled, inbox);
  }

  @Bean
  VerificationFactors verificationFactors(JdbcTemplate db, PasswordEncoder encoder) {
    return new VerificationFactors() {
      public boolean passwordMatches(String customer, String password) {
        if (password == null
            || password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72) return false;
        var hashes =
            db.queryForList(
                "select password_hash from customer_credentials where customer_id=? and enabled=true",
                String.class,
                customer);
        return !hashes.isEmpty() && encoder.matches(password, hashes.getFirst());
      }

      public String hashOtp(String code) {
        return encoder.encode(code);
      }

      public boolean otpMatches(String code, String hash) {
        return code != null
            && code.matches("[0-9]{6}")
            && hash != null
            && encoder.matches(code, hash);
      }
    };
  }

  @Bean
  SecurityService securityService(
      SecurityStore store,
      Clock clock,
      VerificationFactors factors,
      OtpGenerator otp,
      SmsSender sms,
      @Value("${aster.security.session-timeout:PT1H}") Duration timeout) {
    if (timeout.isNegative() || timeout.isZero())
      throw new IllegalArgumentException("Session timeout must be positive");
    return new SecurityService(store, clock, factors, otp, sms, timeout);
  }

  @Bean
  AuthenticationManager authenticationManager(JdbcTemplate db, PasswordEncoder encoder) {
    UserDetailsService users =
        email -> {
          var rows =
              db.query(
                  "select customer_id,password_hash,enabled from customer_credentials where email=?",
                  (r, n) ->
                      User.withUsername(r.getString(1))
                          .password(r.getString(2))
                          .roles("CUSTOMER")
                          .disabled(!r.getBoolean(3))
                          .build(),
                  email.toLowerCase(Locale.ROOT));
          if (rows.isEmpty()) throw new UsernameNotFoundException("Invalid credentials");
          return rows.getFirst();
        };
    var provider = new DaoAuthenticationProvider(users);
    provider.setPasswordEncoder(encoder);
    return new ProviderManager(provider);
  }

  @Bean
  HttpSessionSecurityContextRepository securityContextRepository() {
    return new HttpSessionSecurityContextRepository();
  }

  @Bean
  CookieCsrfTokenRepository csrfRepository(
      @Value("${aster.security.secure-cookie:true}") boolean secure) {
    var repo = CookieCsrfTokenRepository.withHttpOnlyFalse();
    repo.setCookieCustomizer(c -> c.path("/").sameSite("Lax").secure(secure));
    return repo;
  }

  @Bean
  SessionAuthenticationStrategy sessionAuthenticationStrategy(CookieCsrfTokenRepository csrf) {
    return new CompositeSessionAuthenticationStrategy(
        java.util.List.of(
            new ChangeSessionIdAuthenticationStrategy(), new CsrfAuthenticationStrategy(csrf)));
  }

  @Bean
  DefaultCookieSerializer cookieSerializer(
      @Value("${aster.security.secure-cookie:true}") boolean secure) {
    var c = new DefaultCookieSerializer();
    c.setCookieName("SESSION");
    c.setCookiePath("/");
    c.setUseHttpOnlyCookie(true);
    c.setUseSecureCookie(secure);
    c.setSameSite("Lax");
    c.setCookieMaxAge(-1);
    return c;
  }
}
