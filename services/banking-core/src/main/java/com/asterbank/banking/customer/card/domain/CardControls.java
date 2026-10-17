package com.asterbank.banking.customer.card.domain;

public record CardControls(
    boolean onlinePayments,
    boolean internationalPayments,
    boolean atmWithdrawals,
    boolean contactless) {
  public boolean enablesAny(CardControls after) {
    return !onlinePayments && after.onlinePayments
        || !internationalPayments && after.internationalPayments
        || !atmWithdrawals && after.atmWithdrawals
        || !contactless && after.contactless;
  }
}
