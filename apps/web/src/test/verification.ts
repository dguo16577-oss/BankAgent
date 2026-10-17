import type { components } from "@/generated/customer-api";
import { bankingStore, type MockBankingStore } from "@/mocks/bank/store";
import { SecurityService } from "@/mocks/bank/security-service";
import { securityFixture } from "@/mocks/data/security-fixture";
type S = components["schemas"];
const grants = new WeakMap<object, string>();
// Test fixtures take the same challenge → factors → grant path as a customer.
export async function verifiedIntent<
  T extends { id: string; intentHash: string },
>(prepared: Promise<T>, store: MockBankingStore = bankingStore): Promise<T> {
  const intent = await prepared,
    s = store.read();
  let action: S["VerificationAction"] | undefined,
    resource: S["StepUpChallenge"]["resourceType"] | undefined;
  if (s.intents[intent.id]) {
    action = "TRANSFER_EXECUTE";
    resource = "TRANSFER_INTENT";
  }
  if (s.investmentOrderIntents[intent.id]) {
    action = "INVESTMENT_ORDER_EXECUTE";
    resource = "INVESTMENT_ORDER_INTENT";
  }
  if (s.recurringPaymentActionIntents[intent.id]) {
    action = "RECURRING_STOP_FUTURE_PAYMENTS";
    resource = "RECURRING_PAYMENT_INTENT";
  }
  const r = s.recipientIntents[intent.id];
  if (r) {
    action =
      r.actionType === "CREATE" ? "RECIPIENT_CREATE" : "RECIPIENT_DEACTIVATE";
    resource = "RECIPIENT_ACTION_INTENT";
  }
  const p = s.scheduleIntents[intent.id];
  if (p) {
    action =
      p.actionType === "CANCEL"
        ? "SCHEDULED_PAYMENT_CANCEL"
        : p.actionType === "AMEND"
          ? "SCHEDULED_PAYMENT_MODIFY"
          : "SCHEDULED_PAYMENT_CREATE";
    resource = "SCHEDULE_ACTION_INTENT";
  }
  const c = s.cardIntents[intent.id];
  if (
    c &&
    c.actionType === "UPDATE_CONTROLS" &&
    c.riskDirection === "PROTECTIVE"
  ) {
    action = "CARD_CONTROL_PROTECTIVE";
    resource = "CARD_ACTION_INTENT";
  }
  if (action && resource) {
    const security = new SecurityService(store);
    if (!store.read().currentSessionId)
      security.login({
        email: securityFixture.email,
        password: securityFixture.password,
      });
    const challenge = await security.createChallenge({
      actionType: action,
      resourceType: resource,
      resourceId: intent.id,
      resourceHash: intent.intentHash,
    });
    const code = challenge.verificationRequirement.includes("SMS_OTP")
      ? security.message(challenge.id).messageBody.match(/\b[0-9]{6}\b/)![0]
      : undefined;
    const result = await security.verify(challenge.id, {
      password: securityFixture.password,
      code,
    });
    grants.set(intent, result.authorization.id);
  }
  return intent;
}
export function authorizationFor(
  intent: { id: string },
  store: MockBankingStore = bankingStore,
): string | undefined {
  return (
    grants.get(intent) ??
    Object.values(store.read().actionAuthorizations).find(
      (a) => a.resourceId === intent.id,
    )?.id
  );
}
