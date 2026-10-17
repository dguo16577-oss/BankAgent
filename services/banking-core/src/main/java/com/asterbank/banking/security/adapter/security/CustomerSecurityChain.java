package com.asterbank.banking.security.adapter.security;

import com.asterbank.banking.security.application.SecurityService;
import com.asterbank.banking.shared.config.WebProperties;
import com.asterbank.contract.customer.model.ApiError;
import java.util.List;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.*;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.*;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.*;
import org.springframework.web.cors.*;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
@Profile("!unit")
@EnableConfigurationProperties(WebProperties.class)
public class CustomerSecurityChain {
  @Bean
  SecurityFilterChain securityFilterChain(
      HttpSecurity http,
      ObjectMapper mapper,
      SecurityService service,
      CookieCsrfTokenRepository csrf,
      HttpSessionSecurityContextRepository contexts)
      throws Exception {
    return http.cors(Customizer.withDefaults())
        .csrf(
            c ->
                c.csrfTokenRepository(csrf)
                    .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
        .formLogin(AbstractHttpConfigurer::disable)
        .httpBasic(AbstractHttpConfigurer::disable)
        .logout(AbstractHttpConfigurer::disable)
        .requestCache(AbstractHttpConfigurer::disable)
        .securityContext(c -> c.securityContextRepository(contexts).requireExplicitSave(true))
        .sessionManagement(c -> c.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
        .authorizeHttpRequests(
            a ->
                a.requestMatchers(
                        "/actuator/health", "/actuator/info", "/public/**", "/customer/auth/login")
                    .permitAll()
                    .requestMatchers("/customer/**")
                    .authenticated()
                    .anyRequest()
                    .denyAll())
        .exceptionHandling(
            e ->
                e.authenticationEntryPoint(
                        (q, r, x) -> {
                          r.setStatus(401);
                          r.setContentType("application/json");
                          mapper.writeValue(
                              r.getOutputStream(),
                              new ApiError(
                                  ApiError.CodeEnum.UNAUTHENTICATED,
                                  "Authentication is required."));
                        })
                    .accessDeniedHandler(
                        (q, r, x) -> {
                          var auth =
                              org.springframework.security.core.context.SecurityContextHolder
                                  .getContext()
                                  .getAuthentication();
                          boolean anonymous =
                              auth == null
                                  || auth
                                      instanceof
                                      org.springframework.security.authentication
                                          .AnonymousAuthenticationToken;
                          r.setStatus(
                              anonymous && !q.getRequestURI().equals("/customer/auth/login")
                                  ? 401
                                  : 403);
                          r.setContentType("application/json");
                          mapper.writeValue(
                              r.getOutputStream(),
                              new ApiError(
                                  r.getStatus() == 401
                                      ? ApiError.CodeEnum.UNAUTHENTICATED
                                      : ApiError.CodeEnum.INVALID_REQUEST,
                                  "Request security validation failed."));
                        }))
        .addFilterAfter(new SessionSecurityFilter(service, mapper), CsrfFilter.class)
        .build();
  }

  @Bean
  UrlBasedCorsConfigurationSource corsConfigurationSource(WebProperties properties) {
    var c = new CorsConfiguration();
    c.setAllowedOrigins(properties.allowedOrigins());
    c.setAllowCredentials(true);
    c.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    c.setAllowedHeaders(
        List.of(
            "Content-Type", "X-Correlation-Id", "X-XSRF-TOKEN", "X-CSRF-TOKEN", "Idempotency-Key"));
    c.setExposedHeaders(List.of("X-Correlation-Id"));
    c.setMaxAge(3600L);
    var source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", c);
    return source;
  }
}
