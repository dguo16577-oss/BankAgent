package com.asterbank.banking.customer.recurring.adapter.web;

import com.asterbank.banking.customer.recurring.domain.*;
import com.asterbank.contract.customer.model.*;
import java.time.OffsetDateTime;

public final class RecurringMapper {
  private RecurringMapper() {}

  private static String time(OffsetDateTime t) {
    return t == null ? null : java.time.format.DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(t);
  }

  private static MerchantSummary merchant(RecurringPayment p) {
    var m = p.merchant();
    return m == null
        ? null
        : new MerchantSummary(m.id(), m.name())
            .location(m.location())
            .maskedCardNumber(m.maskedCardNumber());
  }

  public static RecurringPaymentSummary summary(RecurringPayment p) {
    return new RecurringPaymentSummary()
        .id(p.id())
        .displayName(p.displayName())
        .type(RecurringPaymentType.valueOf(p.type().name()))
        .status(RecurringPaymentStatus.valueOf(p.status().name()))
        .frequency(RecurringPaymentFrequency.valueOf(p.frequency().name()))
        .source(RecurringPaymentSource.valueOf(p.source().name()))
        .sourceAccountId(p.sourceAccountId())
        .cardId(p.cardId())
        .merchant(merchant(p))
        .usualAmount(
            new Money(
                p.usualAmount().decimal(),
                Money.CurrencyEnum.fromValue(p.usualAmount().currency().getCurrencyCode())))
        .nextExpectedAt(time(p.nextExpectedAt()))
        .lastPaidAt(time(p.lastPaidAt()))
        .managementCapability(
            RecurringPaymentManagementCapability.valueOf(p.managementCapability().name()));
  }

  public static RecurringPaymentDetail detail(RecurringPayment p) {
    var d =
        new RecurringPaymentDetail()
            .id(p.id())
            .displayName(p.displayName())
            .type(RecurringPaymentType.valueOf(p.type().name()))
            .status(RecurringPaymentStatus.valueOf(p.status().name()))
            .frequency(RecurringPaymentFrequency.valueOf(p.frequency().name()))
            .source(RecurringPaymentSource.valueOf(p.source().name()))
            .sourceAccountId(p.sourceAccountId())
            .cardId(p.cardId())
            .merchant(merchant(p))
            .usualAmount(
                new Money(
                    p.usualAmount().decimal(),
                    Money.CurrencyEnum.fromValue(p.usualAmount().currency().getCurrencyCode())))
            .nextExpectedAt(time(p.nextExpectedAt()))
            .lastPaidAt(time(p.lastPaidAt()))
            .managementCapability(
                RecurringPaymentManagementCapability.valueOf(p.managementCapability().name()))
            .version(p.version())
            .transactionHistory(p.transactionHistory());
    var v = p.detectionProvenance();
    if (v != null)
      d.detectionProvenance(
          new RecurringDetectionProvenance(
              v.matchedTransactionIds(),
              v.observedOccurrences(),
              time(v.firstObservedAt()),
              time(v.lastObservedAt())));
    return d;
  }

  static RecurringPaymentState state(RecurringPayment.State s) {
    return new RecurringPaymentState(
        RecurringPaymentStatus.valueOf(s.status().name()),
        time(s.nextExpectedAt()),
        RecurringPaymentManagementCapability.valueOf(s.managementCapability().name()),
        s.version());
  }

  public static RecurringPaymentActionIntent intent(RecurringIntent i) {
    var t = i.terms();
    return new RecurringPaymentActionIntent()
        .verificationRequirement(VerificationRequirement.PASSWORD)
        .id(t.id())
        .actionType(RecurringPaymentActionType.STOP_FUTURE_PAYMENTS)
        .recurringPayment(detail(t.payment()))
        .before(state(t.payment().state()))
        .after(state(t.after()))
        .effectDescription(t.effectDescription())
        .intentHash(i.intentHash())
        .createdAt(time(t.createdAt()))
        .expiresAt(time(t.expiresAt()))
        .authorizationRequirement(
            RecurringPaymentActionIntent.AuthorizationRequirementEnum.CONFIRMATION)
        .status(RecurringPaymentActionIntentStatus.valueOf(i.status().name()));
  }

  public static RecurringPaymentActionReceipt action(RecurringAction a) {
    return new RecurringPaymentActionReceipt()
        .id(a.id())
        .intentId(a.terms().id())
        .actionType(RecurringPaymentActionType.STOP_FUTURE_PAYMENTS)
        .status(RecurringPaymentActionReceipt.StatusEnum.COMPLETED)
        .recurringPayment(summary(a.payment()))
        .before(state(a.terms().payment().state()))
        .after(state(a.terms().after()))
        .effectDescription(a.terms().effectDescription())
        .authorizationRequirement(
            RecurringPaymentActionReceipt.AuthorizationRequirementEnum.CONFIRMATION)
        .effectiveAt(time(a.effectiveAt()))
        .reference(a.reference());
  }
}
