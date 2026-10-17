package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;

import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.customer.wealth.domain.*;
import com.asterbank.banking.shared.domain.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class WealthDomainTest {
  static final CustomerId OWNER = new CustomerId("owner");
  static final OffsetDateTime AT = OffsetDateTime.parse("2026-09-27T10:30:00+08:00");

  InvestmentIntent.Terms terms(String amount) {
    var p =
        new InvestmentProduct(
            "product",
            "Bond",
            InvestmentProduct.Type.BOND_FUND,
            RiskLevel.R2,
            Money.of("100", "CNY"),
            InvestmentProduct.Status.AVAILABLE,
            Money.of("1", "CNY"),
            "2.60",
            "Simulated",
            "Demo",
            "Description",
            "No guarantee",
            0);
    var a =
        new Account(
            new AccountId("account"),
            OWNER,
            "Current",
            AccountType.CURRENT,
            AccountStatus.ACTIVE,
            Money.of("5000", "CNY"),
            Money.of("32", "CNY"),
            "•••• 8821",
            AT.minusYears(1),
            null);
    var s =
        new Suitability(
            "check",
            OWNER,
            p.id(),
            RiskLevel.R2,
            RiskLevel.R2,
            0,
            0,
            Suitability.Result.SUITABLE,
            List.of("Within risk"),
            AT,
            AT.plusMinutes(30));
    var m = Money.of(amount, "CNY");
    return new InvestmentIntent.Terms(
        "intent",
        p,
        a,
        s,
        m,
        p.fees(),
        m.add(p.fees()),
        a.availableBalance().subtract(m).subtract(p.fees()),
        AT,
        AT.plusMinutes(15));
  }

  @ParameterizedTest
  @ValueSource(strings = {"500", "500.0", "500.00"})
  void decimalRepresentationDoesNotChangeReviewHash(String amount) {
    assertThat(new InvestmentIntentHasher().hash(terms(amount)))
        .isEqualTo(new InvestmentIntentHasher().hash(terms("500.00")));
  }

  @Test
  void hashBindsAmountsAccountProductCheckFeesAndTime() {
    var h = new InvestmentIntentHasher();
    var t = terms("500");
    assertThat(h.hash(terms("501"))).isNotEqualTo(h.hash(t));
    assertThat(
            h.hash(
                new InvestmentIntent.Terms(
                    "other",
                    t.product(),
                    t.sourceAccount(),
                    t.suitability(),
                    t.amount(),
                    t.fees(),
                    t.totalDebit(),
                    t.projectedAvailableBalance(),
                    t.createdAt(),
                    t.expiresAt())))
        .isNotEqualTo(h.hash(t));
    assertThat(
            h.hash(
                new InvestmentIntent.Terms(
                    t.id(),
                    t.product(),
                    t.sourceAccount(),
                    t.suitability(),
                    t.amount(),
                    Money.of("2", "CNY"),
                    t.totalDebit(),
                    t.projectedAvailableBalance(),
                    t.createdAt(),
                    t.expiresAt())))
        .isNotEqualTo(h.hash(t));
    assertThat(h.fingerprint("a", "bc")).isNotEqualTo(h.fingerprint("ab", "c"));
  }

  @Test
  void expiryUsesInstantAndDoesNotReviveExecutedIntent() {
    var t = terms("500");
    var i = new InvestmentIntent(t, "hash", InvestmentIntent.Status.PREPARED);
    assertThat(i.statusAt(t.expiresAt().toInstant().minusNanos(1)))
        .isEqualTo(InvestmentIntent.Status.PREPARED);
    assertThat(i.statusAt(t.expiresAt().toInstant())).isEqualTo(InvestmentIntent.Status.EXPIRED);
    assertThat(i.executed().statusAt(t.expiresAt().toInstant().plusSeconds(1)))
        .isEqualTo(InvestmentIntent.Status.EXECUTED);
  }

  @Test
  void principalAdditionDoesNotManufactureGain() {
    var p =
        new Position(
            "position",
            OWNER,
            "product",
            "Bond",
            InvestmentProduct.Type.BOND_FUND,
            Money.of("5320", "CNY"),
            Money.of("5100", "CNY"),
            Money.of("220", "CNY"),
            Money.of("0", "CNY"),
            0,
            AT);
    var next = p.purchase(Money.of("1000", "CNY"), AT);
    assertThat(next.currentValue().decimal()).isEqualTo("6320.00");
    assertThat(next.investedAmount().decimal()).isEqualTo("6100.00");
    assertThat(next.gainLoss()).isEqualTo(p.gainLoss());
    assertThat(next.monthlyChange()).isEqualTo(p.monthlyChange());
    assertThat(next.version()).isEqualTo(1);
  }

  @Test
  void riskOrderingIsExplicitlyMonotonic() {
    for (var customer : RiskLevel.values())
      for (var product : RiskLevel.values())
        assertThat(customer.permits(product)).isEqualTo(product.ordinal() <= customer.ordinal());
  }
}
