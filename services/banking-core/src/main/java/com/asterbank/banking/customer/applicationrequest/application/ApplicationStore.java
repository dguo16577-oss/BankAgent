package com.asterbank.banking.customer.applicationrequest.application;

import com.asterbank.banking.customer.applicationrequest.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.*;
import java.util.function.Supplier;

public interface ApplicationStore {
  record Product(String title, String type) {}

  <T> T write(CustomerId owner, Supplier<T> work);

  Optional<Product> product(String id);

  void save(ApplicationIntent intent);

  Optional<ApplicationIntent> intent(CustomerId owner, String id);

  void completeIntent(String id, String applicationId, String authorizationId);

  void cancelIntent(CustomerId owner, String id);

  List<ProductApplication> list(CustomerId owner);

  Optional<ProductApplication> find(CustomerId owner, String id);

  Optional<ProductApplication> replay(CustomerId owner, String key);

  void save(ProductApplication application, String key);
}
