"use client";
import { useLocale } from "@/lib/i18n/locale";
import { CircleDashed, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export function PlaceholderPage({
  title,
  description,
  areas,
  accountId,
}: {
  title: string;
  description: string;
  areas: string[];
  accountId?: string;
}) {
  const { t } = useLocale();

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-3 text-xs font-semibold tracking-[.18em] text-primary">
          {t("PERSONAL BANKING")}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">
            {t(title)}
          </h1>
          <span className="rounded-full border bg-white px-3 py-1 text-xs text-muted-foreground">
            {t("M0 · Preview")}
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {t(description)}
        </p>
      </div>
      <section className="relative overflow-hidden rounded-2xl bg-primary p-7 text-primary-foreground lg:p-10">
        <div className="pointer-events-none absolute -top-16 -right-12 size-64 rounded-full border-[40px] border-white/5" />
        <p className="text-xs font-medium tracking-widest text-teal-200">
          {t("BUILT AROUND YOU")}
        </p>
        <h2 className="mt-4 max-w-xl text-2xl font-medium leading-snug">
          {t(
            title === "Overview"
              ? "Your everyday finances. One clear view."
              : "A dedicated space, ready for what’s next.",
          )}
        </h2>
        <p className="relative mt-3 max-w-lg text-sm leading-6 text-slate-300">
          {t(
            "This area is taking shape. Banking features and financial data will arrive in a future milestone.",
          )}
        </p>
      </section>
      {t(
        accountId && (
          <p className="break-all text-sm text-muted-foreground">
            {t("Account route reference:")}
            {t(" ")}
            <span className="font-mono text-foreground">{t(accountId)}</span>
            {t(" · Placeholder only")}
          </p>
        ),
      )}
      <section
        aria-label={t("Planned workspace sections")}
        className="grid gap-5 md:grid-cols-3"
      >
        {areas.map((area, index) => (
          <Card key={area} className="shadow-none">
            <CardContent className="pt-6">
              <div className="mb-8 flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary">
                  <CircleDashed size={20} aria-hidden="true" />
                </span>
                <span className="text-xs text-muted-foreground">
                  0{index + 1}
                </span>
              </div>
              <h2 className="font-semibold">{t(area)}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("A place for your ")}
                {t(area.toLowerCase())}
                {t(". Available in a future release.")}
              </p>
              <div className="mt-6 border-t pt-4 text-xs text-muted-foreground">
                {t("Coming soon")}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed p-5">
        <p className="text-sm text-muted-foreground">
          {t(
            "You’re exploring the frontend foundation. No live banking data is connected.",
          )}
        </p>
        <Link
          href="/app/overview"
          className="flex items-center gap-2 text-sm font-medium text-primary"
        >
          {t("Workspace overview")}
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
