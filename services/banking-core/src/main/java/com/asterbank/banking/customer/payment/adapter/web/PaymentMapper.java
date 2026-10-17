package com.asterbank.banking.customer.payment.adapter.web;

import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.shared.web.ReadModelMapper;
import com.asterbank.contract.customer.model.*;

public final class PaymentMapper {
  private PaymentMapper() {}

  public static RecipientSummary recipient(Recipient r) {
    return new RecipientSummary()
        .id(r.id().value())
        .displayName(r.displayName())
        .bankName(r.bankName())
        .maskedAccountNumber(r.maskedAccountNumber())
        .phoneMasked(r.phoneMasked())
        .currency(RecipientSummary.CurrencyEnum.fromValue(r.currency().getCurrencyCode()))
        .destinationRef(r.destinationRef())
        .status(RecipientStatus.fromValue(r.status().name()))
        .verificationStatus(RecipientSummary.VerificationStatusEnum.UNVERIFIED)
        .createdAt(r.createdAt() == null ? null : ReadModelMapper.time(r.createdAt()))
        .version(r.version());
  }

  private static TransferAmount amount(com.asterbank.banking.shared.domain.Money m) {
    return new TransferAmount(m.decimal(), TransferAmount.CurrencyEnum.CNY);
  }

  public static com.asterbank.contract.customer.model.TransferIntent intent(
      com.asterbank.banking.customer.payment.domain.TransferIntent i) {
    var t = i.terms();
    return new com.asterbank.contract.customer.model.TransferIntent()
        .id(t.id())
        .verificationRequirement(VerificationRequirement.SMS_OTP)
        .authorizationRequirement(
            com.asterbank.contract.customer.model.TransferIntent.AuthorizationRequirementEnum
                .CONFIRMATION)
        .policyVersion(t.policyVersion() == null ? "LEGACY_CONFIRMATION_V1" : t.policyVersion())
        .status(
            switch (i.status()) {
              case PREPARED -> TransferIntentStatus.PREPARED;
              case EXECUTED -> TransferIntentStatus.EXECUTED;
              case EXPIRED -> TransferIntentStatus.EXPIRED;
              case CANCELLED -> TransferIntentStatus.CANCELLED;
            })
        .sourceAccount(ReadModelMapper.account(t.sourceAccount()))
        .recipient(recipient(t.recipient()))
        .amount(amount(t.amount()))
        .fee(ReadModelMapper.money(t.fee()))
        .totalDebit(ReadModelMapper.money(t.totalDebit()))
        .projectedAvailableBalance(ReadModelMapper.money(t.projectedAvailableBalance()))
        .note(t.note())
        .intentHash(i.intentHash())
        .createdAt(ReadModelMapper.time(t.createdAt()))
        .expiresAt(ReadModelMapper.time(t.expiresAt()));
  }

  public static TransferReceipt receipt(Transfer r) {
    var t = r.terms();
    return new TransferReceipt()
        .id(r.id())
        .status(TransferStatus.COMPLETED)
        .intentId(t.id())
        .sourceAccount(ReadModelMapper.account(r.sourceAccount()))
        .recipient(recipient(r.recipient()))
        .amount(amount(t.amount()))
        .fee(ReadModelMapper.money(t.fee()))
        .totalDebit(ReadModelMapper.money(t.totalDebit()))
        .note(t.note())
        .reference(r.reference())
        .transactionId(r.transactionId().value())
        .createdAt(ReadModelMapper.time(r.completedAt()))
        .completedAt(ReadModelMapper.time(r.completedAt()));
  }
}
