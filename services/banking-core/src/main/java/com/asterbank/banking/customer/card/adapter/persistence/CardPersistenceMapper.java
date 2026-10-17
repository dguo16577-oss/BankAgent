package com.asterbank.banking.customer.card.adapter.persistence;

import com.asterbank.banking.customer.card.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import tools.jackson.databind.ObjectMapper;

public final class CardPersistenceMapper {
  public record IntentDocument(int version, CardIntentTerms terms) {}

  public record ActionDocument(int version, CardAction action) {}

  private final ObjectMapper mapper;

  public CardPersistenceMapper(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  public Card card(CardJpaEntity e) {
    return new Card(
        e.cardId,
        new CustomerId(e.customerId),
        e.displayName,
        e.maskedNumber,
        Card.Scheme.valueOf(e.scheme),
        Card.Type.valueOf(e.cardType),
        new Card.State(
            Card.Status.valueOf(e.status),
            new CardControls(
                e.onlinePayments, e.internationalPayments, e.atmWithdrawals, e.contactless),
            e.businessVersion,
            new CardLimits(
                e.perTransactionLimit, e.dailyLimit, e.bankMaxPerTransaction, e.bankMaxDaily)),
        new Card.LinkedAccount(e.linkedAccountId, e.linkedAccountName, e.linkedAccountMaskedNumber),
        e.updatedAt);
  }

  public void state(Card c, CardJpaEntity e) {
    e.status = c.state().status().name();
    e.onlinePayments = c.state().controls().onlinePayments();
    e.internationalPayments = c.state().controls().internationalPayments();
    e.atmWithdrawals = c.state().controls().atmWithdrawals();
    e.contactless = c.state().controls().contactless();
    e.perTransactionLimit = c.state().limits().perTransaction();
    e.dailyLimit = c.state().limits().daily();
    e.businessVersion = c.state().version();
    e.updatedAt = c.updatedAt();
  }

  public String intent(CardIntentTerms t) {
    return mapper.writeValueAsString(new IntentDocument(1, t));
  }

  public CardIntentTerms intent(String json) {
    var d = mapper.readValue(json, IntentDocument.class);
    if (d.version() != 1) throw new IllegalStateException("Unsupported card snapshot");
    return d.terms();
  }

  public String action(CardAction a) {
    return mapper.writeValueAsString(new ActionDocument(1, a));
  }

  public CardAction action(String json) {
    var d = mapper.readValue(json, ActionDocument.class);
    if (d.version() != 1) throw new IllegalStateException("Unsupported card snapshot");
    return d.action();
  }
}
