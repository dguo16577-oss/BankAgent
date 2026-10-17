package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;

import com.asterbank.banking.customer.recurring.domain.*;
import com.asterbank.banking.customer.spending.application.*;
import com.asterbank.banking.customer.spending.domain.*;
import com.asterbank.banking.shared.domain.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;

class RecurringSpendingDomainTest {
  @Test
  void wireTimesRetainSecondsRequiredByFrozenTimestampPattern() {
    var p =
        payment(
            RecurringPayment.Type.DIRECT_DEBIT,
            RecurringPayment.Status.ACTIVE,
            RecurringPayment.Source.BANK_MANAGED,
            RecurringPayment.Capability.STOP_FUTURE_PAYMENTS);
    var wire = com.asterbank.banking.customer.recurring.adapter.web.RecurringMapper.detail(p);
    assertThat(wire.getLastPaidAt()).isEqualTo("2026-09-27T10:30:00+08:00");
    var period =
        new SpendingPeriod(at.toLocalDate().atStartOfDay().atOffset(ZoneOffset.ofHours(8)), at);
    var report =
        new SpendingReport(
            period,
            period.previousMonth(),
            "CNY",
            List.of(),
            BigDecimal.ZERO,
            BigDecimal.ZERO,
            0,
            List.of(),
            List.of(),
            List.of(),
            at);
    var summary =
        com.asterbank.banking.customer.spending.adapter.web.SpendingMapper.summary(report);
    assertThat(summary.getPeriod().getFrom()).isEqualTo("2026-09-27T00:00:00+08:00");
  }

  final OffsetDateTime at = OffsetDateTime.parse("2026-09-27T10:30:00+08:00");

  RecurringPayment payment(
      RecurringPayment.Type type,
      RecurringPayment.Status status,
      RecurringPayment.Source source,
      RecurringPayment.Capability capability) {
    return new RecurringPayment(
        "rec_test",
        new CustomerId("customer"),
        "Demo",
        type,
        status,
        RecurringPayment.Frequency.MONTHLY,
        source,
        "account",
        null,
        null,
        Money.of("88.00", "CNY"),
        at.plusMonths(1),
        at,
        capability,
        0,
        List.of("transaction"),
        null);
  }

  @ParameterizedTest
  @EnumSource(
      value = RecurringPayment.Type.class,
      names = {"CARD_SUBSCRIPTION", "DIRECT_DEBIT", "STANDING_ORDER"})
  void stopIsProtectiveAndPreservesHistory(RecurringPayment.Type type) {
    var p =
        payment(
            type,
            RecurringPayment.Status.ACTIVE,
            RecurringPayment.Source.BANK_MANAGED,
            RecurringPayment.Capability.STOP_FUTURE_PAYMENTS);
    var s = p.stop();
    assertThat(s.status()).isEqualTo(RecurringPayment.Status.STOPPED);
    assertThat(s.nextExpectedAt()).isNull();
    assertThat(s.lastPaidAt()).isEqualTo(p.lastPaidAt());
    assertThat(s.transactionHistory()).isEqualTo(p.transactionHistory());
    assertThat(s.usualAmount()).isEqualTo(p.usualAmount());
    assertThat(s.version()).isEqualTo(1);
    assertThat(p.status()).isEqualTo(RecurringPayment.Status.ACTIVE);
    assertThat(p.effectDescription()).doesNotContain("account cancelled", "contract terminated");
  }

  @Test
  void backendOwnsCapabilityAndTerminalState() {
    var active =
        payment(
            RecurringPayment.Type.CARD_SUBSCRIPTION,
            RecurringPayment.Status.ACTIVE,
            RecurringPayment.Source.BANK_MANAGED,
            RecurringPayment.Capability.STOP_FUTURE_PAYMENTS);
    assertThatThrownBy(() -> active.stop().stop()).hasMessage("RECURRING_PAYMENT_ALREADY_STOPPED");
    assertThatThrownBy(
            () ->
                payment(
                        RecurringPayment.Type.DETECTED_RECURRING_PAYMENT,
                        RecurringPayment.Status.ACTIVE,
                        RecurringPayment.Source.DETECTED_PATTERN,
                        RecurringPayment.Capability.NONE)
                    .stop())
        .hasMessage("RECURRING_PAYMENT_NOT_MANAGEABLE");
    assertThatThrownBy(
            () ->
                payment(
                        RecurringPayment.Type.CARD_SUBSCRIPTION,
                        RecurringPayment.Status.ENDED,
                        RecurringPayment.Source.BANK_MANAGED,
                        RecurringPayment.Capability.STOP_FUTURE_PAYMENTS)
                    .stop())
        .hasMessage("RECURRING_PAYMENT_NOT_MANAGEABLE");
  }

  @Test
  void canonicalHashBindsTermsAndNormalizesOffsets() {
    var p =
        payment(
            RecurringPayment.Type.CARD_SUBSCRIPTION,
            RecurringPayment.Status.ACTIVE,
            RecurringPayment.Source.BANK_MANAGED,
            RecurringPayment.Capability.STOP_FUTURE_PAYMENTS);
    var t =
        new RecurringIntent.Terms(
            "intent", p, p.stop().state(), p.effectDescription(), at, at.plusMinutes(15));
    var h = new RecurringIntentHasher();
    var hash = h.hash(t);
    assertThat(hash).matches("[a-f0-9]{64}");
    assertThat(
            h.hash(
                new RecurringIntent.Terms(
                    t.id(),
                    p,
                    t.after(),
                    t.effectDescription(),
                    at.withOffsetSameInstant(ZoneOffset.UTC),
                    t.expiresAt().withOffsetSameInstant(ZoneOffset.UTC))))
        .isEqualTo(hash);
    assertThat(
            h.hash(
                new RecurringIntent.Terms(
                    "other", p, t.after(), t.effectDescription(), at, t.expiresAt())))
        .isNotEqualTo(hash);
    assertThat(
            h.hash(new RecurringIntent.Terms(t.id(), p, t.after(), "different", at, t.expiresAt())))
        .isNotEqualTo(hash);
    assertThat(
            h.hash(
                new RecurringIntent.Terms(
                    t.id(), p, t.after(), t.effectDescription(), at, t.expiresAt().plusSeconds(1))))
        .isNotEqualTo(hash);
    assertThat(h.fingerprint("a", "bc")).isNotEqualTo(h.fingerprint("ab", "c"));
    var i = new RecurringIntent(t, hash, RecurringIntent.Status.PREPARED);
    assertThat(i.statusAt(t.expiresAt().toInstant().minusNanos(1)))
        .isEqualTo(RecurringIntent.Status.PREPARED);
    assertThat(i.statusAt(t.expiresAt().toInstant())).isEqualTo(RecurringIntent.Status.EXPIRED);
    assertThat(i.executed().statusAt(t.expiresAt().toInstant()))
        .isEqualTo(RecurringIntent.Status.EXECUTED);
  }

  @ParameterizedTest
  @CsvSource({"168,4800,3.50", "1,32,3.13", "-1,32,-3.13", "0,100,0.00"})
  void decimalPercentageHalfAwayFromZero(String n, String d, String expected) {
    assertThat(SpendingReport.percentage(new BigDecimal(n), new BigDecimal(d))).isEqualTo(expected);
  }

  @Test
  void zeroComparisonIsNull() {
    assertThat(SpendingReport.percentage(BigDecimal.TEN, BigDecimal.ZERO)).isNull();
  }

  @Test
  void calendarComparisonClampsAtMonthEndWithoutEmptyWindow() {
    var p =
        new SpendingPeriod(
            OffsetDateTime.parse("2026-03-30T13:00:00+08:00"),
            OffsetDateTime.parse("2026-03-31T12:00:00+08:00"));
    var c = p.previousMonth();
    assertThat(c.from()).isEqualTo(OffsetDateTime.parse("2026-02-28T13:00:00+08:00"));
    assertThat(c.to()).isEqualTo(OffsetDateTime.parse("2026-03-01T00:00:00+08:00"));
    assertThatThrownBy(() -> new SpendingPeriod(at, at))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new SpendingPeriod(at, at.plusDays(367)))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void applicationQueryUsesClockAndPairedWindows() {
    var clock = Clock.fixed(at.toInstant(), ZoneOffset.UTC);
    var captured = new ArrayList<SpendingPeriod>();
    TransactionAnalyticsPort port =
        (owner, account, p, c, asOf) -> {
          captured.add(p);
          captured.add(c);
          assertThat(asOf.toInstant()).isEqualTo(at.toInstant());
          return null;
        };
    var service = new SpendingQueryService(port, clock);
    service.query(new CustomerId("customer"), Map.of());
    assertThat(captured.getFirst().from())
        .isEqualTo(OffsetDateTime.parse("2026-09-01T00:00:00+08:00"));
    assertThat(captured.get(1).to().toInstant()).isEqualTo(at.minusMonths(1).toInstant());
    assertThatThrownBy(
            () -> service.query(new CustomerId("customer"), Map.of("compareFrom", at.toString())))
        .hasMessage("INVALID_QUERY");
  }
}
