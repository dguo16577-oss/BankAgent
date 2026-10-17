package com.asterbank.banking.customer.wealth.application;

import com.asterbank.banking.customer.wealth.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.*;
import java.util.function.Supplier;

public interface WealthStore {
  <T> T read(Supplier<T> work);

  <T> T write(CustomerId owner, Supplier<T> work);

  List<InvestmentProduct> products(InvestmentProduct.Type type, RiskLevel risk);

  Optional<InvestmentProduct> product(String id);

  Optional<RiskProfile> risk(CustomerId owner);

  List<Position> positions(CustomerId owner);

  Optional<Suitability> suitability(CustomerId owner, String id);

  Optional<InvestmentIntent> intent(CustomerId owner, String id);

  Optional<InvestmentOrder> order(CustomerId owner, String id);

  Optional<RedemptionIntent> redemptionIntent(CustomerId owner, String id);

  Optional<RedemptionOrder> redemptionOrder(CustomerId owner, String id);

  void save(Suitability check);

  void save(InvestmentIntent intent);

  void save(InvestmentOrder order);

  void save(Position position);

  void save(RedemptionIntent intent);

  void save(RedemptionOrder order);
}
