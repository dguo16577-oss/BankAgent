package com.asterbank.banking.customer.card.adapter.web;

import com.asterbank.banking.customer.card.domain.Card;
import com.asterbank.banking.customer.card.domain.CardAction;
import com.asterbank.contract.customer.model.*;

public final class CardMapper {
  private CardMapper() {}

  static CardControls controls(com.asterbank.banking.customer.card.domain.CardControls c) {
    return new CardControls(
        c.onlinePayments(), c.internationalPayments(), c.atmWithdrawals(), c.contactless());
  }

  static CardState state(Card.State s) {
    return new CardState(
            CardStatus.fromValue(s.status().name()), controls(s.controls()), s.version())
        .limits(limits(s.limits()));
  }

  static CardLimits limits(com.asterbank.banking.customer.card.domain.CardLimits l) {
    return new CardLimits(
        l.perTransaction().toPlainString(),
        l.daily().toPlainString(),
        l.bankMaxPerTransaction().toPlainString(),
        l.bankMaxDaily().toPlainString());
  }

  static CardLinkedAccount linked(Card c) {
    var a = c.linkedAccount();
    return new CardLinkedAccount(a.id(), a.displayName(), a.maskedAccountNumber());
  }

  public static CardSummary summary(Card c) {
    return new CardSummary(
        c.id(),
        c.displayName(),
        c.maskedNumber(),
        CardScheme.fromValue(c.scheme().name()),
        CardType.fromValue(c.type().name()),
        CardStatus.fromValue(c.state().status().name()),
        linked(c));
  }

  static CardDetail detail(Card c) {
    return new CardDetail(
            c.id(),
            c.displayName(),
            c.maskedNumber(),
            CardScheme.fromValue(c.scheme().name()),
            CardType.fromValue(c.type().name()),
            CardStatus.fromValue(c.state().status().name()),
            linked(c),
            controls(c.state().controls()),
            c.state().version(),
            c.updatedAt().toString())
        .limits(limits(c.state().limits()));
  }

  static CardActionIntent intent(com.asterbank.banking.customer.card.domain.CardActionIntent i) {
    var t = i.terms();
    return new CardActionIntent(
            t.id(),
            CardActionIntentStatus.fromValue(i.status().name()),
            CardActionType.fromValue(t.actionType().name()),
            summary(t.card()),
            state(t.change().before()),
            state(t.change().after()),
            RiskDirection.fromValue(t.change().risk().name()),
            AuthorizationRequirement.fromValue(t.change().authorization().name()),
            i.intentHash(),
            t.createdAt().toString(),
            t.expiresAt().toString())
        .verificationRequirement(
            VerificationRequirement.valueOf(
                com.asterbank.banking.security.domain.VerificationPolicy.resolve(
                        com.asterbank.banking.customer.card.application.CardService
                            .verificationAction(t))
                    .name()));
  }

  static CardActionReceipt receipt(CardAction a) {
    var t = a.terms();
    return new CardActionReceipt(
        a.id(),
        t.id(),
        CardActionReceipt.StatusEnum.COMPLETED,
        CardActionType.fromValue(t.actionType().name()),
        summary(a.card()),
        state(t.change().before()),
        state(t.change().after()),
        RiskDirection.fromValue(t.change().risk().name()),
        AuthorizationRequirement.fromValue(t.change().authorization().name()),
        a.reference(),
        a.completedAt().toString(),
        a.completedAt().toString());
  }
}
