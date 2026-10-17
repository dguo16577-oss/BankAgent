import type { components } from "@/generated/customer-api";
import { apiGet, apiPost } from "./client";
type S = components["schemas"];
export const login = async (body: S["LoginRequest"]) => {
  await apiPost<S["Session"]>("/customer/auth/login", body);
  return apiGet<S["Session"]>("/customer/session");
};
export const logout = () =>
  apiPost<S["LogoutResponse"]>("/customer/auth/logout", {});
export const createChallenge = (body: S["CreateStepUpChallengeRequest"]) =>
  apiPost<S["StepUpChallenge"]>("/customer/auth/step-up-challenges", body);
export const getChallenge = (id: string, signal?: AbortSignal) =>
  apiGet<S["StepUpChallenge"]>(
    `/customer/auth/step-up-challenges/${encodeURIComponent(id)}`,
    signal,
  );
export const verifyChallenge = (id: string, body: S["VerifyStepUpRequest"]) =>
  apiPost<S["StepUpVerificationResponse"]>(
    `/customer/auth/step-up-challenges/${encodeURIComponent(id)}/verify`,
    body,
  );

export const getVerificationProfile = (signal?: AbortSignal) =>
  apiGet<S["CustomerVerificationProfile"]>(
    "/customer/security/profile",
    signal,
  );
export const getDemoSms = (id: string) =>
  apiGet<S["DemoSmsMessage"]>(`/customer/demo/sms/${encodeURIComponent(id)}`);
