package com.asterbank.banking.security.domain;

public final class VerificationPolicy {
  private VerificationPolicy() {}

  public static VerificationRequirement resolve(VerificationAction action) {
    return switch (action) {
      case CARD_FREEZE -> VerificationRequirement.NONE;
      case LOGIN,
          RECIPIENT_DEACTIVATE,
          SCHEDULED_PAYMENT_CANCEL,
          SPLIT_REQUEST_CANCEL,
          CARD_CONTROL_PROTECTIVE,
          RECURRING_STOP_FUTURE_PAYMENTS,
          PRODUCT_APPLICATION_SUBMIT ->
          VerificationRequirement.PASSWORD;
      case TRANSFER_EXECUTE,
          SCHEDULED_PAYMENT_CREATE,
          SPLIT_REQUEST_CREATE,
          SCHEDULED_PAYMENT_MODIFY,
          CARD_APPLICATION_SUBMIT ->
          VerificationRequirement.SMS_OTP;
      case RECIPIENT_CREATE,
          CARD_UNFREEZE,
          CARD_CONTROL_RISK_INCREASING,
          CREDIT_LIMIT_APPLICATION_SUBMIT,
          INVESTMENT_ORDER_EXECUTE,
          LOAN_APPLICATION_SUBMIT ->
          VerificationRequirement.PASSWORD_AND_SMS_OTP;
    };
  }
}
