"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { receiptPath } from "@/lib/api/receipt-navigation";
const subscribeReceipt = () => () => {};
import { useQuery } from "@tanstack/react-query";
import type { components } from "@/generated/customer-api";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale";
import {
  createChallenge,
  verifyChallenge,
  getChallenge,
  getVerificationProfile,
  getDemoSms,
} from "@/lib/api/security";
type S = components["schemas"];
export function ActionVerification({
  action,
  resourceType,
  resourceId,
  resourceHash,
  label,
  disabled,
  onVerified,
  completed = false,
  completedLabel = "View completed receipt",
}: {
  action: S["VerificationAction"];
  resourceType: S["CreateStepUpChallengeRequest"]["resourceType"];
  resourceId: string;
  resourceHash: string;
  label: string;
  disabled?: boolean;
  onVerified: (authorizationId?: string) => Promise<void>;
  completed?: boolean;
  completedLabel?: string;
}) {
  const { t, errorMessage } = useLocale();
  const router = useRouter();
  const receipt = useSyncExternalStore(
    subscribeReceipt,
    () => receiptPath(resourceId),
    () => undefined,
  );
  const [challenge, setChallenge] = useState<S["StepUpChallenge"]>();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [grant, setGrant] = useState<string>();
  const [sms, setSms] = useState<string>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<unknown>();
  const profile = useQuery({
    queryKey: ["verification-profile"],
    queryFn: ({ signal }) => getVerificationProfile(signal),
    enabled: !!challenge,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  async function run(work: () => Promise<void>) {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } catch (e) {
      setError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function begin() {
    if (action === "CARD_FREEZE") {
      setAttempted(true);
      await onVerified();
      return;
    }
    setCode("");
    setPassword("");
    setSms(undefined);
    setChallenge(
      await createChallenge({
        actionType: action,
        resourceType,
        resourceId,
        resourceHash,
      }),
    );
  }
  async function verify() {
    if (!challenge) return;
    const body: S["VerifyStepUpRequest"] = {
      ...(challenge.verificationRequirement.includes("PASSWORD")
        ? { password }
        : {}),
      ...(challenge.verificationRequirement.includes("SMS_OTP")
        ? { code }
        : {}),
    };
    setPassword("");
    setCode("");
    try {
      const result = await verifyChallenge(challenge.id, body);
      setGrant(result.authorization.id);
      setSms(undefined);
      setChallenge(result.challenge);
      await onVerified(result.authorization.id);
    } catch (e) {
      try {
        setChallenge(await getChallenge(challenge.id));
      } catch {
        /* Preserve the original verification or execution error. */
      }
      throw e;
    } finally {
      body.password = "";
      body.code = "";
    }
  }
  const pending = challenge?.status === "PENDING";
  if (completed)
    return receipt ? (
      <Button type="button" onClick={() => router.replace(receipt)}>
        {t(completedLabel)}
      </Button>
    ) : (
      <p role="status">{t("This action is already completed.")}</p>
    );
  return (
    <div className="w-full min-w-0 space-y-4" data-testid="action-verification">
      {!challenge && (
        <Button
          type="button"
          disabled={disabled || busy}
          onClick={() => void run(begin)}
        >
          {t(
            busy
              ? action === "CARD_FREEZE"
                ? "Processing…"
                : "Preparing verification…"
              : attempted
                ? "Retry confirmation"
                : label,
          )}
        </Button>
      )}
      {pending && (
        <section
          className="space-y-4 rounded-xl border p-4"
          aria-label={t("Verify this action")}
        >
          <h2 className="font-semibold">{t("Verify this action")}</h2>
          <p className="text-sm">
            {t("Verification applies only to the action shown above.")}
          </p>
          {challenge.maskedPhone && (
            <p className="text-sm">
              {t("Bound phone")}: {challenge.maskedPhone}
            </p>
          )}
          {challenge.verificationRequirement.includes("PASSWORD") && (
            <label className="block text-sm">
              {t("Account password")}
              <input
                className="mt-2 w-full min-w-0 rounded-md border p-3"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {challenge.verificationRequirement.includes("SMS_OTP") && (
            <label className="block text-sm">
              {t("SMS verification code")}
              <input
                className="mt-2 w-full min-w-0 rounded-md border p-3"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            {t("Attempts remaining: ")}
            {challenge.attemptsRemaining}
          </p>
          {profile.data?.demoSmsAvailable &&
            challenge.verificationRequirement.includes("SMS_OTP") && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () =>
                    setSms((await getDemoSms(challenge.id)).messageBody),
                  )
                }
              >
                {t("View simulated SMS")}
              </Button>
            )}
          {sms && (
            <p
              role="status"
              className="break-words rounded-lg bg-secondary p-3 text-sm"
            >
              {sms}
            </p>
          )}
          <Button
            type="button"
            disabled={
              disabled ||
              busy ||
              (challenge.verificationRequirement.includes("PASSWORD") &&
                !password) ||
              (challenge.verificationRequirement.includes("SMS_OTP") &&
                !/^[0-9]{6}$/.test(code))
            }
            onClick={() => void run(verify)}
          >
            {t(busy ? "Verifying…" : "Verify and continue")}
          </Button>
        </section>
      )}
      {challenge && !pending && !grant && (
        <p role="status">
          {t("Verification ")}
          {t(challenge.status.toLowerCase())}
        </p>
      )}
      {grant && (
        <Button
          type="button"
          disabled={disabled || busy}
          onClick={() => void run(() => onVerified(grant))}
        >
          {t("Retry confirmation")}
        </Button>
      )}
      {challenge && !pending && (
        <Button
          type="button"
          variant="outline"
          disabled={disabled || busy}
          onClick={() =>
            void run(async () => {
              setGrant(undefined);
              await begin();
            })
          }
        >
          {t("Verify again")}
        </Button>
      )}
      {error != null && (
        <p role="alert" className="break-words text-sm text-destructive">
          {errorMessage(error)}
        </p>
      )}
    </div>
  );
}
