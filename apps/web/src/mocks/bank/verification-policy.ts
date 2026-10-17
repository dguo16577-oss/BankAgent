import type { components } from "@/generated/customer-api";
type S = components["schemas"];
export const verificationPolicy: Record<
  S["VerificationAction"],
  S["VerificationRequirement"]
> = {
  LOGIN: "PASSWORD",
  RECIPIENT_CREATE: "PASSWORD_AND_SMS_OTP",
  RECIPIENT_DEACTIVATE: "PASSWORD",
  TRANSFER_EXECUTE: "SMS_OTP",
  SCHEDULED_PAYMENT_CREATE: "SMS_OTP",
  SCHEDULED_PAYMENT_MODIFY: "SMS_OTP",
  SCHEDULED_PAYMENT_CANCEL: "PASSWORD",
  SPLIT_REQUEST_CREATE: "SMS_OTP",
  SPLIT_REQUEST_CANCEL: "PASSWORD",
  CARD_FREEZE: "NONE",
  CARD_UNFREEZE: "PASSWORD_AND_SMS_OTP",
  CARD_CONTROL_RISK_INCREASING: "PASSWORD_AND_SMS_OTP",
  CARD_CONTROL_PROTECTIVE: "PASSWORD",
  INVESTMENT_ORDER_EXECUTE: "PASSWORD_AND_SMS_OTP",
  RECURRING_STOP_FUTURE_PAYMENTS: "PASSWORD",
  CARD_APPLICATION_SUBMIT: "SMS_OTP",
  CREDIT_LIMIT_APPLICATION_SUBMIT: "PASSWORD_AND_SMS_OTP",
  LOAN_APPLICATION_SUBMIT: "PASSWORD_AND_SMS_OTP",
  PRODUCT_APPLICATION_SUBMIT: "PASSWORD",
};
export function generateOtp() {
  // Rejection sampling avoids modulo bias.
  const values = new Uint32Array(1);
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= 4294000000);
  return String(values[0] % 1000000).padStart(6, "0");
}
