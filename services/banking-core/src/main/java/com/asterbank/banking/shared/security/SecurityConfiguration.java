package com.asterbank.banking.shared.security;

import com.asterbank.banking.shared.config.WebProperties;
import com.asterbank.contract.customer.model.ApiError;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
@org.springframework.context.annotation.Profile("unit")
@EnableConfigurationProperties(WebProperties.class)
public class SecurityConfiguration {
  @Bean
  SecurityFilterChain securityFilterChain(HttpSecurity http, ObjectMapper mapper) throws Exception {
    return http.cors(Customizer.withDefaults())
        // CSRF stays enabled, including for anonymous unsafe requests.
        .csrf(Customizer.withDefaults())
        .formLogin(AbstractHttpConfigurer::disable)
        .httpBasic(AbstractHttpConfigurer::disable)
        .logout(AbstractHttpConfigurer::disable)
        .requestCache(AbstractHttpConfigurer::disable)
        .sessionManagement(
            session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
        .authorizeHttpRequests(
            auth ->
                auth.requestMatchers("/actuator/health", "/actuator/info", "/public/**")
                    .permitAll()
                    .requestMatchers("/customer/**")
                    .authenticated()
                    .anyRequest()
                    .denyAll())
        .exceptionHandling(
            errors ->
                errors
                    .authenticationEntryPoint(
                        (request, response, exception) -> {
                          response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                          response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                          mapper.writeValue(
                              response.getOutputStream(),
                              new ApiError(
                                  ApiError.CodeEnum.UNAUTHENTICATED,
                                  "Authentication is required."));
                        })
                    .accessDeniedHandler(
                        (request, response, exception) -> {
                          var authentication =
                              org.springframework.security.core.context.SecurityContextHolder
                                  .getContext()
                                  .getAuthentication();
                          boolean anonymous =
                              authentication == null
                                  || !authentication.isAuthenticated()
                                  || authentication
                                      instanceof
                                      org.springframework.security.authentication
                                          .AnonymousAuthenticationToken;
                          boolean transfer =
                              request.getRequestURI().equals("/customer/transfer-intents")
                                  || request.getRequestURI().equals("/customer/transfers");
                          if (anonymous && transfer) {
                            response.setStatus(401);
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            mapper.writeValue(
                                response.getOutputStream(),
                                new ApiError(
                                    ApiError.CodeEnum.UNAUTHENTICATED,
                                    "Authentication is required."));
                            return;
                          }
                          response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                          response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
                          mapper.writeValue(
                              response.getOutputStream(), ProblemDetail.forStatus(403));
                        }))
        .build();
  }

  @Bean
  UrlBasedCorsConfigurationSource corsConfigurationSource(WebProperties properties) {
    CorsConfiguration cors = new CorsConfiguration();
    cors.setAllowedOrigins(properties.allowedOrigins());
    cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    cors.setAllowedHeaders(
        List.of("Content-Type", "X-Correlation-Id", "X-CSRF-TOKEN", "Idempotency-Key"));
    cors.setExposedHeaders(List.of("X-Correlation-Id"));
    cors.setAllowCredentials(true);
    cors.setMaxAge(3600L);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", cors);
    return source;
  }
}
