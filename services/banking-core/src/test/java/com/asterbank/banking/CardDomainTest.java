package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;

import com.asterbank.banking.customer.card.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class CardDomainTest {
  static final CardControls ON = new CardControls(true, true, true, true);

  static Card card(Card.Status status, CardControls controls) {
    return new Card(
        "card_aster_debit",
        new CustomerId("usr_aster_alex"),
        "Visa Debit",
        "••8821",
        Card.Scheme.VISA,
        Card.Type.DEBIT,
        new Card.State(status, controls, 0),
        new Card.LinkedAccount("acc_current", "CNY Current", "•••• 1048"),
        OffsetDateTime.parse("2026-09-27T10:30:00+08:00"));
  }

  static CardIntentTerms terms(Card c, CardActionType action, CardControls controls) {
    var at = OffsetDateTime.parse("2026-09-28T08:00:00Z");
    return new CardIntentTerms(
        "intent_test", c, action, c.plan(action, controls), at, at.plusMinutes(15));
  }

  @Test
  void protectiveFreezeAndStepUpUnfreezeAreDomainDecisions() {
    var active = card(Card.Status.ACTIVE, ON);
    var freeze = active.plan(CardActionType.FREEZE, null);
    assertThat(freeze.risk()).isEqualTo(RiskDirection.PROTECTIVE);
    assertThat(freeze.authorization()).isEqualTo(AuthorizationRequirement.CONFIRMATION);
    var frozen = active.apply(CardActionType.FREEZE, freeze, active.updatedAt().plusSeconds(1));
    assertThat(frozen.state().version()).isEqualTo(1);
    var unfreeze = frozen.plan(CardActionType.UNFREEZE, null);
    assertThat(unfreeze.risk()).isEqualTo(RiskDirection.RISK_INCREASING);
    assertThat(unfreeze.authorization()).isEqualTo(AuthorizationRequirement.STEP_UP_AUTH);
    assertThat(active.state().status()).isEqualTo(Card.Status.ACTIVE);
  }

  @Test
  void allControlCombinationsClassifyAnyEnableAsRiskIncreasing() {
    for (int before = 0; before < 16; before++)
      for (int after = 0; after < 16; after++) {
        var card = card(Card.Status.ACTIVE, controls(before));
        final var target = controls(after);
        if (before == after)
          assertThatThrownBy(() -> card.plan(CardActionType.UPDATE_CONTROLS, target))
              .isInstanceOfSatisfying(
                  CardRuleViolation.class,
                  e -> assertThat(e.code()).isEqualTo(CardRuleViolation.Code.NO_CARD_CHANGES));
        else {
          var change = card.plan(CardActionType.UPDATE_CONTROLS, target);
          boolean enables = (after & ~before) != 0;
          assertThat(change.risk())
              .isEqualTo(enables ? RiskDirection.RISK_INCREASING : RiskDirection.PROTECTIVE);
          assertThat(change.authorization())
              .isEqualTo(
                  enables
                      ? AuthorizationRequirement.STEP_UP_AUTH
                      : AuthorizationRequirement.CONFIRMATION);
          assertThat(change.after().controls()).isEqualTo(target);
          assertThat(change.before().controls()).isEqualTo(controls(before));
        }
      }
  }

  static CardControls controls(int bits) {
    return new CardControls((bits & 1) != 0, (bits & 2) != 0, (bits & 4) != 0, (bits & 8) != 0);
  }

  @ParameterizedTest
  @EnumSource(
      value = Card.Status.class,
      names = {"EXPIRED", "CANCELLED", "REPORTED_LOST"})
  void terminalCardsCannotChange(Card.Status status) {
    for (var action : CardActionType.values())
      assertThatThrownBy(
              () ->
                  card(status, ON)
                      .plan(
                          action,
                          action == CardActionType.UPDATE_CONTROLS ? controls(0) : null,
                          action == CardActionType.UPDATE_LIMITS ? CardLimits.defaults() : null))
          .isInstanceOfSatisfying(
              CardRuleViolation.class,
              e -> assertThat(e.code()).isEqualTo(CardRuleViolation.Code.CARD_NOT_ELIGIBLE));
  }

  @Test
  void alreadyStateAndMalformedControlsAreRejected() {
    assertThatThrownBy(() -> card(Card.Status.FROZEN, ON).plan(CardActionType.FREEZE, null))
        .isInstanceOf(CardRuleViolation.class);
    assertThatThrownBy(() -> card(Card.Status.ACTIVE, ON).plan(CardActionType.UNFREEZE, null))
        .isInstanceOf(CardRuleViolation.class);
    assertThatThrownBy(() -> card(Card.Status.ACTIVE, ON).plan(CardActionType.FREEZE, ON))
        .isInstanceOf(CardRuleViolation.class);
    assertThatThrownBy(
            () -> card(Card.Status.ACTIVE, ON).plan(CardActionType.UPDATE_CONTROLS, null))
        .isInstanceOf(CardRuleViolation.class);
  }

  @Test
  void exactReviewedStateAndRiskMustMatchAtApply() {
    var card = card(Card.Status.ACTIVE, ON);
    var change = card.plan(CardActionType.FREEZE, null);
    var modified = card.apply(CardActionType.FREEZE, change, card.updatedAt().plusSeconds(1));
    assertThatThrownBy(() -> modified.apply(CardActionType.FREEZE, change, modified.updatedAt()))
        .isInstanceOf(CardRuleViolation.class);
    var forged =
        new Card.Change(
            change.before(),
            change.after(),
            RiskDirection.RISK_INCREASING,
            AuthorizationRequirement.STEP_UP_AUTH);
    assertThatThrownBy(() -> card.apply(CardActionType.FREEZE, forged, card.updatedAt()))
        .isInstanceOf(CardRuleViolation.class);
  }

  @Test
  void canonicalHashBindsEveryReviewTermAndNormalizesOffsets() {
    var original = terms(card(Card.Status.ACTIVE, ON), CardActionType.FREEZE, null);
    var hash = new CardIntentHasher();
    var digest = hash.hash(original);
    assertThat(digest).hasSize(64).isEqualTo(hash.hash(original));
    var offset =
        new CardIntentTerms(
            original.id(),
            original.card(),
            original.actionType(),
            original.change(),
            original.createdAt().withOffsetSameInstant(ZoneOffset.ofHours(8)),
            original.expiresAt().withOffsetSameInstant(ZoneOffset.ofHours(8)));
    assertThat(hash.hash(offset)).isEqualTo(digest);
    var differentControls =
        terms(card(Card.Status.ACTIVE, controls(7)), CardActionType.FREEZE, null);
    var differentStatus = terms(card(Card.Status.FROZEN, ON), CardActionType.UNFREEZE, null);
    var c = original.card();
    var otherCard =
        new Card(
            "other",
            c.customerId(),
            c.displayName(),
            c.maskedNumber(),
            c.scheme(),
            c.type(),
            c.state(),
            c.linkedAccount(),
            c.updatedAt());
    for (var changed :
        java.util.List.of(
            differentControls,
            differentStatus,
            terms(otherCard, CardActionType.FREEZE, null),
            new CardIntentTerms(
                "another-intent",
                c,
                original.actionType(),
                original.change(),
                original.createdAt(),
                original.expiresAt()),
            new CardIntentTerms(
                original.id(),
                c,
                original.actionType(),
                original.change(),
                original.createdAt(),
                original.expiresAt().plusSeconds(1))))
      assertThat(hash.hash(changed)).isNotEqualTo(digest);
    assertThat(hash.fingerprint("a", "b", null))
        .isNotEqualTo(hash.fingerprint("a", "b", ""))
        .isNotEqualTo(hash.fingerprint("a", "b", "authorization"));
  }

  @Test
  void intentExpiresAtExactBoundaryButExecutedReceiptRemainsTerminal() {
    var t = terms(card(Card.Status.ACTIVE, ON), CardActionType.FREEZE, null);
    var i =
        new CardActionIntent(t, new CardIntentHasher().hash(t), CardActionIntent.Status.PREPARED);
    assertThat(i.statusAt(t.expiresAt().toInstant().minusNanos(1)))
        .isEqualTo(CardActionIntent.Status.PREPARED);
    assertThat(i.statusAt(t.expiresAt().toInstant())).isEqualTo(CardActionIntent.Status.EXPIRED);
    assertThat(i.executed().statusAt(t.expiresAt().plusDays(1).toInstant()))
        .isEqualTo(CardActionIntent.Status.EXECUTED);
    assertThat(i.cancelled().statusAt(t.expiresAt().plusDays(1).toInstant()))
        .isEqualTo(CardActionIntent.Status.CANCELLED);
    assertThatThrownBy(() -> i.cancelled().executed()).isInstanceOf(IllegalStateException.class);
  }

  @Test
  void formalLossCannotBeUndoneByOrdinaryUnfreeze() {
    var active = card(Card.Status.ACTIVE, ON);
    var lost =
        active.apply(
            CardActionType.REPORT_LOST,
            active.plan(CardActionType.REPORT_LOST, null),
            active.updatedAt().plusSeconds(1));
    assertThat(lost.state().status()).isEqualTo(Card.Status.REPORTED_LOST);
    assertThatThrownBy(() -> lost.plan(CardActionType.UNFREEZE, null))
        .isInstanceOf(CardRuleViolation.class);
  }

  @Test
  void customerLimitCannotExceedBankPolicyAndIncreaseNeedsStepUp() {
    var active = card(Card.Status.ACTIVE, ON);
    var old = active.state().limits();
    var lower = old.withCustomerLimits(new java.math.BigDecimal("1000.00"), old.daily());
    var higher = old.withCustomerLimits(new java.math.BigDecimal("3000.00"), old.daily());
    assertThat(active.plan(CardActionType.UPDATE_LIMITS, null, lower).risk())
        .isEqualTo(RiskDirection.PROTECTIVE);
    assertThat(active.plan(CardActionType.UPDATE_LIMITS, null, higher).authorization())
        .isEqualTo(AuthorizationRequirement.STEP_UP_AUTH);
    assertThatThrownBy(
            () -> old.withCustomerLimits(new java.math.BigDecimal("30000.00"), old.daily()))
        .isInstanceOf(CardRuleViolation.class);
  }

  @Test
  void fullPanIsRejectedAtTheDomainBoundary() {
    var c = card(Card.Status.ACTIVE, ON);
    assertThatThrownBy(
            () ->
                new Card(
                    c.id(),
                    c.customerId(),
                    c.displayName(),
                    "4111111111111111",
                    c.scheme(),
                    c.type(),
                    c.state(),
                    c.linkedAccount(),
                    c.updatedAt()))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
