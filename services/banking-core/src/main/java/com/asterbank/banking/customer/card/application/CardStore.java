package com.asterbank.banking.customer.card.application;

import com.asterbank.banking.customer.card.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.*;
import java.util.function.Supplier;

public interface CardStore {
  <T> T write(Supplier<T> work);

  List<Card> cards(CustomerId owner);

  Optional<Card> card(CustomerId owner, String id);

  void save(Card card);

  Optional<CardActionIntent> intent(CustomerId owner, String id);

  void save(CardActionIntent intent);

  Optional<CardAction> action(CustomerId owner, String id);

  void save(CardAction action);
}
