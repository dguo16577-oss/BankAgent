package com.asterbank.banking.customer.card.adapter.persistence;

import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface CardSpringDataRepository extends JpaRepository<CardJpaEntity, String> {
  @Query("from CardJpaEntity where customerId=:c order by displayOrder,cardId")
  List<CardJpaEntity> owned(@Param("c") String customer);

  @Query("from CardJpaEntity where customerId=:c and cardId=:id")
  Optional<CardJpaEntity> owned(@Param("c") String customer, @Param("id") String id);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("from CardJpaEntity where customerId=:c and cardId=:id")
  Optional<CardJpaEntity> locked(@Param("c") String customer, @Param("id") String id);
}
