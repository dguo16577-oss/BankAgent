"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale";
export function ApplicationsEntry() {
  const { t } = useLocale();
  return (
    <div className="mb-5 flex flex-wrap gap-3">
      <Button asChild>
        <Link href="/app/applications/new">{t("Apply for a product")}</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/app/applications">{t("My applications")}</Link>
      </Button>
    </div>
  );
}
