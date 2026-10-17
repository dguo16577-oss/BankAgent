"use client";
import { useLocale } from "@/lib/i18n/locale";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api/client";
export const fieldClass =
  "mt-2 h-11 w-full min-w-0 rounded-md border bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";
export function PaymentError({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  const { t, errorMessage } = useLocale();

  return (
    <Card>
      <CardContent className="space-y-4">
        <p role="alert">{errorMessage(error)}</p>
        {retry && (
          <Button variant="outline" onClick={retry}>
            {t("Retry")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
export function ResourceError({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  const { t } = useLocale();

  if (error instanceof ApiError && error.status === 404)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">{t("Transfer not found")}</h1>
        <p>
          {t("This transfer or intent is unavailable in this demo session.")}
        </p>
        <Link href="/app/payments" className="text-primary underline">
          {t("Back to Payments")}
        </Link>
      </div>
    );
  return <PaymentError error={error} retry={retry} />;
}
export function Fields({ items }: { items: [string, string][] }) {
  const { t } = useLocale();

  return (
    <dl className="space-y-5 text-sm">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="flex min-w-0 flex-wrap justify-between gap-2"
        >
          <dt className="text-muted-foreground">{t(label, "transfer")}</dt>
          <dd className="min-w-0 max-w-full break-words font-medium [overflow-wrap:anywhere]">
            {label === "Status" ? t(value) : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
