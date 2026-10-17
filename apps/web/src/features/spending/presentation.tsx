"use client";
import { useLocale } from "@/lib/i18n/locale";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
export const words = (text: string) =>
  text
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
export const recurringHref = (id: string) =>
  `/app/spending/recurring/${encodeURIComponent(id)}`;
export const contractDisclaimer =
  "Stopping future payments through the bank may not terminate the user's external service contract.";
export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { t } = useLocale();

  return (
    <Card className="min-w-0 shadow-none">
      <CardContent className="space-y-5">
        <h2 className="text-lg font-semibold">{t(title)}</h2>
        {t(children)}
      </CardContent>
    </Card>
  );
}
export function Status({ value }: { value: string }) {
  const { t } = useLocale();

  return (
    <span
      data-testid="recurring-status"
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${value === "ACTIVE" ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}
    >
      {t(value)}
    </span>
  );
}
export function RequestError({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  const { t, errorMessage } = useLocale();

  return (
    <div className="space-y-4 rounded-xl border p-5">
      <p role="alert">{errorMessage(error)}</p>
      {error instanceof ApiError && error.status === 404 ? (
        <Link href="/app/spending" className="text-primary underline">
          {t("Back to Spending")}
        </Link>
      ) : (
        <Button variant="outline" onClick={retry}>
          {t("Retry")}
        </Button>
      )}
    </div>
  );
}
