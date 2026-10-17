package com.asterbank.banking;

import static org.assertj.core.api.Assertions.assertThat;

import com.asterbank.contract.customer.model.Money;
import com.asterbank.contract.customer.model.TransactionSummary;
import com.asterbank.contract.customer.model.TransactionSummaryAmount;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;

class GeneratedBoundaryValidationTest {
  @Test
  void timestampPatternsValidateWireStringsWithoutValidatorTypeMismatch() {
    try (var factory = Validation.buildDefaultValidatorFactory()) {
      var validator = factory.getValidator();
      var transaction = new TransactionSummary().occurredAt("2026-09-27T10:30:00+08:00");
      assertThat(validator.validateProperty(transaction, "occurredAt")).isEmpty();
      transaction.occurredAt("2026-09-27T10:30:00");
      assertThat(validator.validateProperty(transaction, "occurredAt")).isNotEmpty();
      assertThat(validator.validateProperty(transaction, "bookedAt")).isEmpty();
    }
  }

  @Test
  void composedTransactionAmountRetainsNonNegativeConstraint() {
    try (var factory = Validation.buildDefaultValidatorFactory()) {
      var validator = factory.getValidator();
      var transactionAmount =
          new TransactionSummaryAmount("32.00", TransactionSummaryAmount.CurrencyEnum.CNY);
      assertThat(validator.validate(transactionAmount)).isEmpty();
      transactionAmount.amount("-32.00");
      assertThat(validator.validate(transactionAmount)).isNotEmpty();
      assertThat(validator.validate(new Money("-32.00", Money.CurrencyEnum.CNY))).isEmpty();
    }
  }
}
