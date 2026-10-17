package com.asterbank.banking.customer.payment.application;

import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.*;
import java.util.function.Supplier;

/** Persistence boundary for verified, owner-scoped AA requests. */
public interface SplitStore {
  record Target(
      CustomerId customerId, com.asterbank.banking.customer.account.domain.AccountId accountId) {}

  <T> T write(CustomerId owner, Supplier<T> operation);

  Optional<Target> verifiedTarget(CustomerId owner, RecipientId recipient);

  Optional<SplitBill> bill(CustomerId owner, String id);

  Optional<SplitBill> participantBill(CustomerId participant, String id);

  List<SplitBill> ownerBills(CustomerId owner);

  List<SplitBill> participantBills(CustomerId participant);

  void saveBill(SplitBill bill);

  Optional<SplitActionIntent> intent(CustomerId owner, String id);

  void saveIntent(SplitActionIntent intent);

  Optional<String> result(CustomerId owner, String intentId);
}
