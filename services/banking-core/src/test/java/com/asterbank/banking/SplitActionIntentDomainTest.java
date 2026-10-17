package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;

import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.customer.payment.domain.RecipientId;
import com.asterbank.banking.customer.payment.domain.SplitActionIntent;
import com.asterbank.banking.customer.payment.domain.SplitBill;
import com.asterbank.banking.customer.payment.domain.SplitParticipant;
import com.asterbank.banking.shared.domain.CustomerId;
import com.asterbank.banking.shared.domain.Money;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class SplitActionIntentDomainTest {
  private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-10-08T10:00:00+08:00");

  private static SplitBill bill(String recipient, String amount, String note) {
    return new SplitBill(
        "split_1",
        new CustomerId("alex"),
        new AccountId("account_alex"),
        Money.of("100.00", "CNY"),
        Money.of(
            new java.math.BigDecimal("100.00")
                .subtract(new java.math.BigDecimal(amount))
                .toPlainString(),
            "CNY"),
        List.of(
            new SplitParticipant(
                "part_1",
                new RecipientId(recipient),
                new CustomerId("zhang"),
                new AccountId("account_zhang"),
                Money.of(amount, "CNY"),
                SplitParticipant.Status.PENDING)),
        note,
        SplitBill.Status.ACTIVE,
        0,
        NOW,
        NOW.plusDays(7),
        null);
  }

  @Test
  void hashBindsExactRecipientAmountNoteAndSession() {
    var base =
        SplitActionIntent.prepare(
            "intent_1",
            "session_a",
            SplitActionIntent.Type.CREATE,
            bill("recipient_zhang", "50.00", "dinner"),
            NOW);
    assertThat(base.statusAt(NOW.plusMinutes(14))).isEqualTo(SplitActionIntent.Status.PREPARED);
    assertThat(base.intentHash())
        .isNotEqualTo(
            SplitActionIntent.prepare(
                    "intent_1",
                    "session_a",
                    SplitActionIntent.Type.CREATE,
                    bill("recipient_other", "50.00", "dinner"),
                    NOW)
                .intentHash());
    assertThat(base.intentHash())
        .isNotEqualTo(
            SplitActionIntent.prepare(
                    "intent_1",
                    "session_a",
                    SplitActionIntent.Type.CREATE,
                    bill("recipient_zhang", "60.00", "dinner"),
                    NOW)
                .intentHash());
    assertThat(base.intentHash())
        .isNotEqualTo(
            SplitActionIntent.prepare(
                    "intent_1",
                    "session_a",
                    SplitActionIntent.Type.CREATE,
                    bill("recipient_zhang", "50.00", "changed"),
                    NOW)
                .intentHash());
    assertThat(base.intentHash())
        .isNotEqualTo(
            SplitActionIntent.prepare(
                    "intent_1",
                    "session_b",
                    SplitActionIntent.Type.CREATE,
                    bill("recipient_zhang", "50.00", "dinner"),
                    NOW)
                .intentHash());
  }

  @Test
  void revisionRevokesOldConfirmationAndExpiryIsBoundaryInclusive() {
    var prepared =
        SplitActionIntent.prepare(
            "intent_1",
            "session_a",
            SplitActionIntent.Type.CREATE,
            bill("recipient_zhang", "50.00", null),
            NOW);
    var revoked = prepared.transition(SplitActionIntent.Status.CANCELLED, NOW.plusMinutes(1));
    assertThat(revoked.statusAt(NOW.plusMinutes(2))).isEqualTo(SplitActionIntent.Status.CANCELLED);
    assertThatThrownBy(
            () -> revoked.transition(SplitActionIntent.Status.EXECUTED, NOW.plusMinutes(2)))
        .isInstanceOf(IllegalStateException.class);
    assertThat(prepared.statusAt(NOW.plusMinutes(15))).isEqualTo(SplitActionIntent.Status.EXPIRED);
    assertThatThrownBy(
            () -> prepared.transition(SplitActionIntent.Status.EXECUTED, NOW.plusMinutes(15)))
        .isInstanceOf(IllegalStateException.class);
    assertThatThrownBy(
            () ->
                new SplitActionIntent(
                    prepared.id(),
                    prepared.customerId(),
                    prepared.sessionId(),
                    prepared.actionType(),
                    prepared.splitId(),
                    prepared.expectedVersion(),
                    prepared.reviewedBill(),
                    prepared.intentHash(),
                    prepared.createdAt(),
                    prepared.expiresAt(),
                    SplitActionIntent.Status.EXECUTED,
                    prepared.expiresAt()))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("terminal time");
    assertThatThrownBy(
            () ->
                new SplitActionIntent(
                    prepared.id(),
                    prepared.customerId(),
                    prepared.sessionId(),
                    prepared.actionType(),
                    prepared.splitId(),
                    prepared.expectedVersion(),
                    bill("recipient_zhang", "60.00", null),
                    prepared.intentHash(),
                    prepared.createdAt(),
                    prepared.expiresAt(),
                    SplitActionIntent.Status.PREPARED,
                    null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("hash mismatch");
  }

  @Test
  void cancellationOfExistingBillIsOnlyAPreparedAction() {
    var existing = bill("recipient_zhang", "50.00", null);
    var intent =
        SplitActionIntent.prepare(
            "cancel_1", "session_a", SplitActionIntent.Type.CANCEL, existing, NOW.plusHours(1));
    assertThat(intent.expectedVersion()).isEqualTo(existing.version());
    assertThat(intent.reviewedBill().status()).isEqualTo(SplitBill.Status.ACTIVE);
    assertThat(intent.status()).isEqualTo(SplitActionIntent.Status.PREPARED);
    assertThat(intent.intentHash())
        .isNotEqualTo(
            SplitActionIntent.prepare(
                    "cancel_1",
                    "session_b",
                    SplitActionIntent.Type.CANCEL,
                    existing,
                    NOW.plusHours(1))
                .intentHash());
  }
}
