package com.asterbank.banking;

import static org.assertj.core.api.Assertions.assertThat;

import com.asterbank.banking.customer.payment.domain.Recipient;
import com.asterbank.banking.customer.payment.domain.RecipientId;
import com.asterbank.banking.customer.payment.domain.RecipientPhone;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.Currency;
import org.junit.jupiter.api.Test;

class RecipientPhoneTest {
  @Test
  void normalizesOnlyExactDemoPhones() {
    for (var input :
        new String[] {
          "13800138000",
          "+8613800138000",
          "+86 138 0013 8000",
          "0086-138-0013-8000",
          "+86 (138) 0013 8000"
        }) {
      assertThat(RecipientPhone.canonical(input)).isEqualTo("+8613800138000");
    }
    for (var input :
        new String[] {
          "1380013800", "138001380000", "23800138000", "1380013800x", "1399999999?", "138****8000"
        }) {
      assertThat(RecipientPhone.canonical(input)).isNull();
    }
    assertThat(RecipientPhone.masked("+8613800138000")).isEqualTo("138****8000");
  }

  @Test
  void contactPhoneChangeDoesNotChangeTransferDestination() {
    var before =
        new Recipient(
            new RecipientId("r1"),
            new CustomerId("customer"),
            "张三",
            "Demo Bank",
            "•••• 8000",
            Currency.getInstance("CNY"),
            "dest-1",
            Recipient.Status.ACTIVE,
            null,
            0,
            null);
    var withPhone =
        new Recipient(
            before.id(),
            before.customerId(),
            before.displayName(),
            before.bankName(),
            before.maskedAccountNumber(),
            before.currency(),
            before.destinationRef(),
            before.status(),
            before.createdAt(),
            before.version(),
            "138****8000");
    var changedDestination =
        new Recipient(
            before.id(),
            before.customerId(),
            before.displayName(),
            before.bankName(),
            before.maskedAccountNumber(),
            before.currency(),
            "dest-2",
            before.status(),
            before.createdAt(),
            before.version(),
            "138****8000");
    assertThat(before.sameTransferIdentityAs(withPhone)).isTrue();
    assertThat(before.sameTransferIdentityAs(changedDestination)).isFalse();
  }
}
