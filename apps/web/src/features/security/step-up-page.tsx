"use client";
import Link from "next/link";
import { useChallenge } from "./use-security";
import { useLocale } from "@/lib/i18n/locale";
import { Button } from "@/components/ui/button";
export function StepUpPage({ challengeId }: { challengeId: string }) {
  const { t, errorMessage } = useLocale();
  const query = useChallenge(challengeId);
  if (query.isPending) return <p role="status">{t("Loading verification…")}</p>;
  if (query.isError)
    return (
      <div>
        <p role="alert">{errorMessage(query.error)}</p>
        <Button onClick={() => void query.refetch()}>{t("Retry")}</Button>
      </div>
    );
  return (
    <div className="space-y-4">
      <h1>{t("Verify this action")}</h1>
      <p>
        {t("Return to the original review to verify and confirm this action.")}
      </p>
      <Link href="/app/payments">{t("Back to Payments")}</Link>
    </div>
  );
}
