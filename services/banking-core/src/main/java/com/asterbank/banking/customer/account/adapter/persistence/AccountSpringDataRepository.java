package com.asterbank.banking.customer.account.adapter.persistence;

import org.springframework.context.annotation.Profile;
import org.springframework.data.jpa.repository.JpaRepository;

@Profile("!unit")
public interface AccountSpringDataRepository extends JpaRepository<AccountJpaEntity, String> {
  java.util.List<AccountJpaEntity> findAllByCustomerIdOrderByAccountId(String customerId);

  java.util.Optional<AccountJpaEntity> findByAccountIdAndCustomerId(String id, String customerId);
}
