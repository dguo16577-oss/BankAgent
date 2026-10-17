package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;

import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.customer.payment.domain.RecipientId;
import com.asterbank.banking.customer.payment.domain.SplitBill;
import com.asterbank.banking.customer.payment.domain.SplitParticipant;
import com.asterbank.banking.shared.domain.CustomerId;
import com.asterbank.banking.shared.domain.Money;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class SplitBillDomainTest {
  private static final OffsetDateTime CREATED = OffsetDateTime.parse("2026-10-08T10:00:00+08:00");
  private static final CustomerId OWNER = new CustomerId("alex");

  private static SplitParticipant participant(
      String id, String recipient, String customer, String amount) {
    return new SplitParticipant(
        id,
        new RecipientId(recipient),
        new CustomerId(customer),
        new AccountId("account_" + customer),
        Money.of(amount, "CNY"),
        SplitParticipant.Status.PENDING);
  }

  private static SplitBill bill(List<SplitParticipant> participants, String ownShare) {
    return new SplitBill(
        "split_1",
        OWNER,
        new AccountId("account_alex"),
        Money.of("100.00", "CNY"),
        Money.of(ownShare, "CNY"),
        participants,
        "Dinner",
        SplitBill.Status.ACTIVE,
        0,
        CREATED,
        CREATED.plusDays(7),
        null);
  }

  @Test
  void exactSharesAndImmutableParticipantsProtectConfirmedTerms() {
    var mutable =
        new ArrayList<>(
            List.of(
                participant("p1", "recipient_zhang", "zhang", "33.34"),
                participant("p2", "recipient_li", "li", "33.33")));
    var split = bill(mutable, "33.33");
    mutable.clear();
    assertThat(split.participants()).hasSize(2);
    assertThat(split.payerShare().decimal()).isEqualTo("33.33");
    assertThatThrownBy(() -> split.participants().clear())
        .isInstanceOf(UnsupportedOperationException.class);
    assertThatThrownBy(
            () -> bill(List.of(participant("p1", "recipient_zhang", "zhang", "33.33")), "33.33"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("equal total");
  }

  @Test
  void onlyCnySplitRequestsAreSupported() {
    assertThatThrownBy(
            () ->
                new SplitBill(
                    "split_usd",
                    OWNER,
                    new AccountId("account_alex"),
                    Money.of("100.00", "USD"),
                    Money.of("0.00", "USD"),
                    List.of(
                        new SplitParticipant(
                            "p1",
                            new RecipientId("recipient_zhang"),
                            new CustomerId("zhang"),
                            new AccountId("account_zhang"),
                            Money.of("100.00", "USD"),
                            SplitParticipant.Status.PENDING)),
                    null,
                    SplitBill.Status.ACTIVE,
                    0,
                    CREATED,
                    CREATED.plusDays(7),
                    null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("amount");
  }

  @Test
  void oneCustomerCannotReceiveTwoRequestsThroughDifferentSavedRecipients() {
    var duplicateCustomer =
        List.of(
            participant("p1", "recipient_zhang", "zhang", "50.00"),
            participant("p2", "recipient_zhang_alias", "zhang", "50.00"));
    assertThatThrownBy(() -> bill(duplicateCustomer, "0.00"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("participant");
    assertThatThrownBy(
            () -> bill(List.of(participant("p1", "recipient_self", "alex", "100.00")), "0.00"))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void cancellationChangesRequestsWithoutChangingMoneyOrAllowingASecondTransition() {
    var original = bill(List.of(participant("p1", "recipient_zhang", "zhang", "100.00")), "0.00");
    var cancelled = original.cancel(CREATED.plusHours(1));
    assertThat(original.status()).isEqualTo(SplitBill.Status.ACTIVE);
    assertThat(original.participants().getFirst().status())
        .isEqualTo(SplitParticipant.Status.PENDING);
    assertThat(cancelled.status()).isEqualTo(SplitBill.Status.CANCELLED);
    assertThat(cancelled.participants().getFirst().status())
        .isEqualTo(SplitParticipant.Status.CANCELLED);
    assertThat(cancelled.total()).isEqualTo(original.total());
    assertThat(cancelled.version()).isEqualTo(1);
    assertThatThrownBy(() -> cancelled.cancel(CREATED.plusHours(2)))
        .isInstanceOf(IllegalStateException.class);
    assertThatThrownBy(() -> original.cancel(CREATED.plusDays(7)))
        .isInstanceOf(IllegalStateException.class);
  }
}
