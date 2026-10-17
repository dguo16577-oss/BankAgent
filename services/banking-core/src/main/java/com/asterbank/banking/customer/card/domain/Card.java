package com.asterbank.banking.customer.card.domain;

import static com.asterbank.banking.customer.card.domain.CardRuleViolation.Code.*;

import com.asterbank.banking.shared.domain.CustomerId;
import java.time.OffsetDateTime;
import java.util.Objects;

public record Card(
    String id,
    CustomerId customerId,
    String displayName,
    String maskedNumber,
    Scheme scheme,
    Type type,
    State state,
    LinkedAccount linkedAccount,
    OffsetDateTime updatedAt) {
  public enum Status {
    ACTIVE,
    FROZEN,
    REPORTED_LOST,
    EXPIRED,
    CANCELLED
  }

  public enum Scheme {
    VISA,
    MASTERCARD
  }

  public enum Type {
    DEBIT,
    CREDIT,
    VIRTUAL
  }

  public record State(Status status, CardControls controls, int version, CardLimits limits) {
    public State(Status status, CardControls controls, int version) {
      this(status, controls, version, CardLimits.defaults());
    }

    public State {
      Objects.requireNonNull(status);
      Objects.requireNonNull(controls);
      if (limits == null) limits = CardLimits.defaults();
      if (version < 0) throw new IllegalArgumentException("Invalid card version");
    }
  }

  public record LinkedAccount(String id, String displayName, String maskedAccountNumber) {}

  public record Change(
      State before, State after, RiskDirection risk, AuthorizationRequirement authorization) {}

  public Card {
    if (maskedNumber == null || !maskedNumber.matches("••[0-9]{4}"))
      throw new IllegalArgumentException("Only masked card identifiers are supported");
    Objects.requireNonNull(state);
  }

  public Change plan(CardActionType action, CardControls controls) {
    return plan(action, controls, null);
  }

  public Change plan(CardActionType action, CardControls controls, CardLimits limits) {
    if (action == null
        || (action == CardActionType.UPDATE_CONTROLS) != (controls != null)
        || (action == CardActionType.UPDATE_LIMITS) != (limits != null))
      throw new CardRuleViolation(INVALID_REQUEST);
    if (state.status() != Status.ACTIVE && state.status() != Status.FROZEN)
      throw new CardRuleViolation(CARD_NOT_ELIGIBLE);
    if (action == CardActionType.FREEZE && state.status() != Status.ACTIVE
        || action == CardActionType.UNFREEZE && state.status() != Status.FROZEN)
      throw new CardRuleViolation(CARD_NOT_ELIGIBLE);
    var after =
        new State(
            action == CardActionType.FREEZE
                ? Status.FROZEN
                : action == CardActionType.UNFREEZE
                    ? Status.ACTIVE
                    : action == CardActionType.REPORT_LOST ? Status.REPORTED_LOST : state.status(),
            controls == null ? state.controls() : controls,
            Math.incrementExact(state.version()),
            limits == null
                ? state.limits()
                : state.limits().withCustomerLimits(limits.perTransaction(), limits.daily()));
    var risk = classify(state, after);
    if (risk == RiskDirection.NEUTRAL) throw new CardRuleViolation(NO_CARD_CHANGES);
    return new Change(
        state,
        after,
        risk,
        risk == RiskDirection.RISK_INCREASING
            ? AuthorizationRequirement.STEP_UP_AUTH
            : AuthorizationRequirement.CONFIRMATION);
  }

  public static RiskDirection classify(State before, State after) {
    if (before.status() == Status.FROZEN && after.status() == Status.ACTIVE
        || before.controls().enablesAny(after.controls())
        || after.limits().perTransaction().compareTo(before.limits().perTransaction()) > 0
        || after.limits().daily().compareTo(before.limits().daily()) > 0)
      return RiskDirection.RISK_INCREASING;
    if (before.status() == Status.ACTIVE && after.status() == Status.FROZEN
        || after.status() == Status.REPORTED_LOST
        || !before.controls().equals(after.controls())
        || !before.limits().equals(after.limits())) return RiskDirection.PROTECTIVE;
    return RiskDirection.NEUTRAL;
  }

  public Card apply(CardActionType type, Change reviewed, OffsetDateTime at) {
    if (!state.equals(reviewed.before())) throw new CardRuleViolation(CARD_STATE_CHANGED);
    var planned =
        plan(
            type,
            type == CardActionType.UPDATE_CONTROLS ? reviewed.after().controls() : null,
            type == CardActionType.UPDATE_LIMITS ? reviewed.after().limits() : null);
    if (!planned.equals(reviewed)) throw new CardRuleViolation(CARD_STATE_CHANGED);
    return new Card(
        id,
        customerId,
        displayName,
        maskedNumber,
        scheme,
        this.type,
        reviewed.after(),
        linkedAccount,
        at);
  }
}
