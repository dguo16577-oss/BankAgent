package com.asterbank.banking.customer.card.application;

import com.asterbank.banking.customer.card.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.math.BigDecimal;
import java.util.*;
import java.util.function.Supplier;

public interface CreditLimitStore {
  <T> T write(CustomerId owner, Supplier<T> work);

  BigDecimal currentLimit(CustomerId owner, String cardId);

  void save(CreditLimitIntent intent);

  Optional<CreditLimitIntent> intent(CustomerId owner, String id);

  void transition(
      CustomerId owner, String id, CreditLimitIntent.Status from, CreditLimitIntent.Status to);

  Optional<CreditLimitApplication> replay(CustomerId owner, String key);

  void save(CreditLimitApplication application);

  List<CreditLimitApplication> list(CustomerId owner);

  Optional<CreditLimitApplication> detail(CustomerId owner, String id);
}
