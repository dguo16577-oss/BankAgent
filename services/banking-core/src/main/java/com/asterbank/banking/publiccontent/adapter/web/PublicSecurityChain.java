package com.asterbank.banking.publiccontent.adapter.web;

import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/** Anonymous content never loads, validates, creates or upgrades a customer security context. */
@Configuration(proxyBeanMethods = false)
@Profile("!unit")
public class PublicSecurityChain {
  @Bean
  @Order(1)
  SecurityFilterChain publicSecurityFilterChain(HttpSecurity http) throws Exception {
    return http.securityMatcher("/public/**")
        .cors(Customizer.withDefaults())
        .csrf(Customizer.withDefaults())
        .formLogin(AbstractHttpConfigurer::disable)
        .httpBasic(AbstractHttpConfigurer::disable)
        .logout(AbstractHttpConfigurer::disable)
        .requestCache(AbstractHttpConfigurer::disable)
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            a ->
                a.requestMatchers(org.springframework.http.HttpMethod.GET, "/public/**")
                    .permitAll()
                    .anyRequest()
                    .denyAll())
        .build();
  }
}
