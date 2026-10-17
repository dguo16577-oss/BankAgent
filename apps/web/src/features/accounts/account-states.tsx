"use client";
import { useLocale } from "@/lib/i18n/locale";

import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function AccountsLoading({ detail = false }: { detail?: boolean }) {
  const { t } = useLocale();

  return (
    <div role="status" className="space-y-5">
      <h1 className="text-3xl font-semibold">
        {t(detail ? "Account details" : "Accounts")}
      </h1>
      <p className="text-sm text-muted-foreground">
        {t(detail ? "Loading account…" : "Loading accounts…")}
      </p>
      <div className="h-40 rounded-xl bg-muted motion-safe:animate-pulse" />
      <div className="h-56 rounded-xl bg-muted motion-safe:animate-pulse" />
    </div>
  );
}
export function AccountsError({
  retry,
  isFetching,
}: {
  retry: () => void;
  isFetching: boolean;
}) {
  const { t } = useLocale();

  return (
    <Card className="max-w-xl shadow-none">
      <CardContent className="space-y-4">
        <CircleAlert aria-hidden="true" className="text-destructive" />
        <div role="alert">
          <h1 className="text-2xl font-semibold">
            {t("Unable to load account information")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Please try again to retrieve your accounts.")}
          </p>
        </div>
        <Button onClick={retry} disabled={isFetching}>
          {t("Retry")}
        </Button>
      </CardContent>
    </Card>
  );
}
