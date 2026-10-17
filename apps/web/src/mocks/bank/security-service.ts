import type { components } from "@/generated/customer-api";
import { MockBankingStore, type BankingState } from "./store";
import { verificationPolicy, generateOtp } from "./verification-policy";
import { hash, fail, record } from "./service-support";
import {
  securityFixture,
  temporaryTestCredential,
} from "../data/security-fixture";
import { demoProfile } from "../data/demo-profile";
type S = components["schemas"];
export function securityEvent(
  state: BankingState,
  type: S["SecurityEvent"]["type"],
  at: string,
  resourceId?: string,
) {
  state.securityEvents.push({
    id: `security_event_${crypto.randomUUID()}`,
    type,
    occurredAt: at,
    ...(state.currentSessionId ? { sessionId: state.currentSessionId } : {}),
    ...(resourceId ? { resourceId } : {}),
  });
}
function revoke(state: BankingState, sessionId: string) {
  const session = state.sessions[sessionId];
  if (session) {
    session.status = "REVOKED";
    session.authenticated = false;
  }
  for (const challenge of Object.values(state.stepUpChallenges))
    if (challenge.sessionId === sessionId && challenge.status === "PENDING")
      challenge.status = "CANCELLED";
  for (const auth of Object.values(state.actionAuthorizations))
    if (auth.sessionId === sessionId && auth.status === "ACTIVE")
      auth.status = "REVOKED";
}
export class SecurityService {
  constructor(
    private store: MockBankingStore,
    private otp: () => string = generateOtp,
    private demo = true,
  ) {}
  login(body: unknown): S["Session"] {
    record(body, ["email", "password"], ["email", "password"]);
    const next = this.store.read();
    if (
      ![securityFixture, temporaryTestCredential].some(
        (credential) =>
          body.email === credential.email &&
          body.password === credential.password,
      )
    ) {
      securityEvent(next, "LOGIN_FAILURE", this.store.clock.now());
      next.clockAt = this.store.clock.now();
      this.store.commit(next);
      return fail(
        "INVALID_CREDENTIALS",
        401,
        "The demo email or password is incorrect.",
      );
    }
    if (next.currentSessionId) revoke(next, next.currentSessionId);
    const at = this.store.clock.now();
    const session: S["Session"] = {
      id: `session_${crypto.randomUUID()}`,
      authenticated: true,
      user: structuredClone(demoProfile.user),
      status: "ACTIVE",
      assuranceLevel: "AAL1",
      authenticatedAt: at,
      expiresAt: new Date(Date.parse(at) + 60 * 60_000).toISOString(),
      mode: "SIMULATED_AUTH",
    };
    next.currentSessionId = session.id;
    next.sessions[session.id] = session;
    next.sessionCredential[session.id] = String(body.email);
    securityEvent(next, "LOGIN_SUCCESS", at);
    next.clockAt = this.store.clock.now();
    this.store.commit(next);
    return structuredClone(session);
  }
  session(): S["Session"] {
    const next = this.store.read();
    const session = next.currentSessionId
      ? next.sessions[next.currentSessionId]
      : undefined;
    if (!session)
      return fail(
        "UNAUTHENTICATED",
        401,
        "Please sign in to the demo environment.",
      );
    if (session.status === "REVOKED")
      return fail(
        "SESSION_REVOKED",
        401,
        "Your session was signed out. Please sign in again.",
      );
    if (
      session.status === "EXPIRED" ||
      Date.parse(this.store.clock.now()) >= Date.parse(session.expiresAt)
    ) {
      session.status = "EXPIRED";
      session.authenticated = false;
      next.clockAt = this.store.clock.now();
      this.store.commit(next);
      return fail(
        "SESSION_EXPIRED",
        401,
        "Your session expired. Please sign in again.",
      );
    }
    return structuredClone(session);
  }
  logout(): S["LogoutResponse"] {
    this.session();
    const next = this.store.read();
    revoke(next, next.currentSessionId!);
    securityEvent(next, "LOGOUT", this.store.clock.now());
    next.clockAt = this.store.clock.now();
    this.store.commit(next);
    return { status: "REVOKED" };
  }
  profile(): S["CustomerVerificationProfile"] {
    this.session();
    return {
      ...this.store.read().phoneBinding,
      availableVerificationFactors: ["PASSWORD", "SMS_OTP"],
      demoSmsAvailable: this.demo,
    };
  }
  message(id: string): S["DemoSmsMessage"] {
    if (!this.demo)
      return fail("DEMO_SMS_UNAVAILABLE", 404, "Demo inbox unavailable.");
    const session = this.session();
    this.challenge(id);
    const message = this.store.read().demoSms[id];
    if (!message || message.sessionId !== session.id)
      return fail("DEMO_SMS_UNAVAILABLE", 404, "Message not found.");
    const { sessionId: _, ...result } = message;
    void _;
    return result;
  }
  async createChallenge(body: unknown): Promise<S["StepUpChallenge"]> {
    const session = this.session();
    record(
      body,
      ["actionType", "resourceType", "resourceId", "resourceHash"],
      ["actionType", "resourceType", "resourceId", "resourceHash"],
    );
    if (
      typeof body.actionType !== "string" ||
      !Object.hasOwn(verificationPolicy, body.actionType) ||
      typeof body.resourceId !== "string" ||
      typeof body.resourceHash !== "string"
    )
      return fail("INVALID_REQUEST", 400, "Invalid verification binding.");
    const action = body.actionType as S["VerificationAction"];
    const requirement = verificationPolicy[action];
    const expectedResource = action.startsWith("RECIPIENT_")
      ? "RECIPIENT_ACTION_INTENT"
      : action.startsWith("SCHEDULED_PAYMENT_")
        ? "SCHEDULE_ACTION_INTENT"
        : action.startsWith("SPLIT_REQUEST_")
          ? "SPLIT_ACTION_INTENT"
          : action === "TRANSFER_EXECUTE"
            ? "TRANSFER_INTENT"
            : action === "INVESTMENT_ORDER_EXECUTE"
              ? "INVESTMENT_ORDER_INTENT"
              : action === "RECURRING_STOP_FUTURE_PAYMENTS"
                ? "RECURRING_PAYMENT_INTENT"
                : action.endsWith("APPLICATION_SUBMIT")
                  ? "APPLICATION_INTENT"
                  : action.startsWith("CARD_")
                    ? "CARD_ACTION_INTENT"
                    : undefined;
    if (body.resourceType !== expectedResource)
      return fail("INVALID_REQUEST", 400, "Action and resource do not match.");
    if (requirement === "NONE")
      return fail("INVALID_REQUEST", 400, "Confirmation only.");
    if (requirement.includes("SMS_OTP") && !this.demo)
      return fail("VERIFICATION_UNAVAILABLE", 503, "SMS provider unavailable.");
    const id = `challenge_${crypto.randomUUID()}`,
      code = requirement.includes("SMS_OTP") ? this.otp() : undefined;
    const otpHash = code ? await hash([id, code]) : undefined;
    this.session();
    const next = this.store.read();
    if (next.currentSessionId !== session.id)
      return fail("UNAUTHENTICATED", 401, "Session changed.");
    const maps = {
      CARD_ACTION_INTENT: next.cardIntents,
      TRANSFER_INTENT: next.intents,
      SCHEDULE_ACTION_INTENT: next.scheduleIntents,
      RECIPIENT_ACTION_INTENT: next.recipientIntents,
      INVESTMENT_ORDER_INTENT: next.investmentOrderIntents,
      RECURRING_PAYMENT_INTENT: next.recurringPaymentActionIntents,
      APPLICATION_INTENT: next.applicationIntents,
    };
    if (
      typeof body.resourceType !== "string" ||
      !Object.hasOwn(maps, body.resourceType)
    )
      return fail("INVALID_REQUEST", 400, "Unknown resource.");
    const resourceType =
      body.resourceType as S["StepUpChallenge"]["resourceType"];
    const intent = maps[resourceType as keyof typeof maps][body.resourceId];
    if (!intent || intent.intentHash !== body.resourceHash)
      return fail("ACTION_AUTHORIZATION_MISMATCH", 403, "Review changed.");
    if (requirement.includes("SMS_OTP") && !next.phoneBinding.phoneVerified)
      return fail("PHONE_NOT_VERIFIED", 409, "A verified phone is required.");
    const at = this.store.clock.now();
    if (Date.parse(at) >= Date.parse(intent.expiresAt))
      return fail("ACTION_AUTHORIZATION_EXPIRED", 403, "Review expired.");
    if ("sessionId" in intent && intent.sessionId !== session.id)
      return fail(
        "ACTION_AUTHORIZATION_MISMATCH",
        403,
        "Review belongs to a different session.",
      );
    const old = Object.values(next.stepUpChallenges).find(
      (c) =>
        c.sessionId === session.id &&
        c.resourceType === resourceType &&
        c.resourceId === body.resourceId &&
        c.resourceHash === body.resourceHash &&
        c.actionType === action &&
        c.status === "PENDING" &&
        Date.parse(at) < Date.parse(c.expiresAt),
    );
    if (old) return this.challenge(old.id);
    const challenge: S["StepUpChallenge"] = {
      id,
      resourceType,
      resourceId: body.resourceId,
      resourceHash: body.resourceHash,
      actionType: action,
      verificationRequirement: requirement,
      method: "ACCOUNT_ACTION_VERIFICATION",
      status: "PENDING",
      createdAt: at,
      expiresAt: new Date(Date.parse(at) + 300000).toISOString(),
      attemptsRemaining: 3,
      ...(code ? { maskedPhone: next.phoneBinding.maskedPhone } : {}),
    };
    next.stepUpChallenges[id] = { ...challenge, sessionId: session.id };
    if (code && otpHash) {
      next.verificationHashes[id] = otpHash;
      next.demoSms[id] = {
        id: `sms_${crypto.randomUUID()}`,
        challengeId: id,
        maskedPhone: next.phoneBinding.maskedPhone,
        messageBody: `Aster Bank: ${code}. Valid for 5 minutes for this action only.`,
        createdAt: at,
        sessionId: session.id,
      };
    }
    securityEvent(next, "STEP_UP_CREATED", at, intent.id);
    if (code) securityEvent(next, "OTP_ISSUED", at, intent.id);
    next.clockAt = at;
    this.store.commit(next);
    return challenge;
  }
  challenge(id: string): S["StepUpChallenge"] {
    const session = this.session();
    const next = this.store.read();
    const item = Object.hasOwn(next.stepUpChallenges, id)
      ? next.stepUpChallenges[id]
      : undefined;
    if (!item || item.sessionId !== session.id)
      return fail(
        "STEP_UP_CHALLENGE_NOT_FOUND",
        404,
        "Verification not found for this session.",
      );
    if (
      item.status === "PENDING" &&
      Date.parse(this.store.clock.now()) >= Date.parse(item.expiresAt)
    ) {
      item.status = "EXPIRED";
      next.clockAt = this.store.clock.now();
      this.store.commit(next);
    }
    const { sessionId: _sessionId, ...publicChallenge } = item;
    void _sessionId;
    return publicChallenge;
  }
  async verify(
    id: string,
    body: unknown,
  ): Promise<S["StepUpVerificationResponse"]> {
    record(body, ["code", "password"], []);
    const codeHash =
      typeof body.code === "string" && /^[0-9]{6}$/.test(body.code)
        ? await hash([id, body.code])
        : undefined;
    const challenge = this.challenge(id);
    if (challenge.status === "EXPIRED")
      return fail(
        "STEP_UP_CHALLENGE_EXPIRED",
        409,
        "Verification expired. Begin verification again from the review.",
      );
    if (challenge.status !== "PENDING")
      return fail(
        "STEP_UP_CHALLENGE_FAILED",
        409,
        "This verification is no longer pending.",
      );
    const next = this.store.read(),
      item = next.stepUpChallenges[id],
      at = this.store.clock.now();
    const credential = [securityFixture, temporaryTestCredential].find(
      (c) => c.email === next.sessionCredential[next.currentSessionId!],
    );
    const passwordOk =
      !item.verificationRequirement.includes("PASSWORD") ||
      (credential !== undefined && body.password === credential.password);
    const otpOk =
      !item.verificationRequirement.includes("SMS_OTP") ||
      (codeHash !== undefined && codeHash === next.verificationHashes[id]);
    if (!(passwordOk && otpOk)) {
      item.attemptsRemaining--;
      if (item.attemptsRemaining === 0) item.status = "FAILED";
      securityEvent(next, "STEP_UP_FAILED", at, item.resourceId);
      next.clockAt = this.store.clock.now();
      this.store.commit(next);
      return fail(
        item.status === "FAILED"
          ? "STEP_UP_CHALLENGE_FAILED"
          : "INVALID_VERIFICATION",
        422,
        "Verification failed. Check your input and remaining attempts.",
      );
    }
    for (const old of Object.values(next.actionAuthorizations))
      if (
        old.status === "ACTIVE" &&
        old.sessionId === item.sessionId &&
        old.resourceType === item.resourceType &&
        old.resourceId === item.resourceId &&
        old.resourceHash === item.resourceHash
      )
        old.status = "REVOKED";
    const authorization: S["ActionAuthorization"] = {
      id: `authorization_${crypto.randomUUID()}`,
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      resourceHash: item.resourceHash,
      actionType: item.actionType,
      assuranceLevel: "AAL2",
      status: "ACTIVE",
      issuedAt: at,
      expiresAt: new Date(Date.parse(at) + 2 * 60_000).toISOString(),
      consumedAt: null,
    };
    item.status = "VERIFIED";
    item.actionAuthorizationId = authorization.id;
    next.actionAuthorizations[authorization.id] = {
      ...authorization,
      sessionId: item.sessionId,
    };
    securityEvent(next, "STEP_UP_VERIFIED", at, item.resourceId);
    securityEvent(next, "AUTHORIZATION_ISSUED", at, item.resourceId);
    next.clockAt = this.store.clock.now();
    this.store.commit(next);
    return {
      challenge: {
        ...challenge,
        status: "VERIFIED",
        actionAuthorizationId: authorization.id,
      },
      authorization,
    };
  }
}
// Validate against the same snapshot that CardService will atomically commit.
export function validateActionAuthorization(
  next: BankingState,
  id: string | undefined,
  intentId: string,
  intentHash: string,
  at: string,
  resourceType: S["ActionAuthorization"]["resourceType"] = "CARD_ACTION_INTENT",
  action?: S["VerificationAction"],
) {
  if (!id)
    return fail(
      "STEP_UP_AUTH_REQUIRED",
      403,
      "Additional verification required for this card action.",
    );
  const auth = Object.hasOwn(next.actionAuthorizations, id)
    ? next.actionAuthorizations[id]
    : undefined;
  if (!auth)
    return fail(
      "ACTION_AUTHORIZATION_NOT_FOUND",
      404,
      "Action authorization not found.",
    );
  if (
    (action !== undefined && auth.actionType !== action) ||
    auth.resourceType !== resourceType ||
    auth.resourceId !== intentId ||
    auth.resourceHash !== intentHash ||
    auth.sessionId !== next.currentSessionId
  )
    return fail(
      "ACTION_AUTHORIZATION_MISMATCH",
      403,
      "Authorization does not match this session and immutable intent.",
    );
  if (auth.status === "CONSUMED")
    return fail(
      "ACTION_AUTHORIZATION_CONSUMED",
      409,
      "Authorization has already been consumed.",
    );
  if (auth.status === "EXPIRED" || Date.parse(at) >= Date.parse(auth.expiresAt))
    return fail(
      "ACTION_AUTHORIZATION_EXPIRED",
      403,
      "Authorization expired. Verify the reviewed action again.",
    );
  if (auth.status !== "ACTIVE" || auth.assuranceLevel !== "AAL2")
    return fail(
      "INSUFFICIENT_AUTH_ASSURANCE",
      403,
      "A valid AAL2 action authorization is required.",
    );
  return auth;
}

export function consumeVerification(
  next: BankingState,
  id: unknown,
  intentId: string,
  intentHash: string,
  at: string,
  resourceType: S["ActionAuthorization"]["resourceType"],
  action: S["VerificationAction"],
) {
  const grant = validateActionAuthorization(
    next,
    typeof id === "string" ? id : undefined,
    intentId,
    intentHash,
    at,
    resourceType,
    action,
  );
  grant.status = "CONSUMED";
  grant.consumedAt = at;
  securityEvent(next, "AUTHORIZATION_CONSUMED", at, intentId);
}
