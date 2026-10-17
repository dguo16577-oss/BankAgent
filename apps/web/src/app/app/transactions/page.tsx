"use client";
import { useLocale } from "@/lib/i18n/locale";
import { Suspense } from "react";
import { TransactionsList } from "@/features/transactions/transactions-list";
export default function Page() {
  const { t } = useLocale();

  return (
    <Suspense fallback={<p role="status">{t("Loading transactions…")}</p>}>
      <TransactionsList />
    </Suspense>
  );
}
