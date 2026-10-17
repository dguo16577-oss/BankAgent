"use client";
import { useLocale } from "@/lib/i18n/locale";

import { CustomerEntry } from "./customer-entry";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowLeftRight,
  Wallet,
  Landmark,
  CreditCard,
  House,
  ShieldCheck,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { components } from "@/generated/public-api";
import { usePublicHome } from "./use-public";
export function PublicError({ retry }: { retry: () => void }) {
  const { t } = useLocale();

  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <p role="alert">{t("Public information is temporarily unavailable.")}</p>
      <Button className="mt-4" onClick={retry}>
        {t("Retry")}
      </Button>
    </div>
  );
}
export function ContentCards({
  items,
}: {
  items: components["schemas"]["PublicContentCard"][];
}) {
  const { t } = useLocale();

  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Card key={item.id} className="h-full shadow-none">
          <CardContent className="flex h-full flex-col gap-4">
            <p className="text-xs font-semibold tracking-wide text-teal-800">
              {t(item.label)}
            </p>
            <h3 className="text-xl font-semibold">
              <Link href={item.route} className="hover:underline">
                {t(item.title)}
              </Link>
            </h3>
            <p className="flex-1 text-sm leading-6 text-muted-foreground">
              {t(item.description)}
            </p>
            <Link
              href={item.route}
              aria-label={t(`Explore ${item.title}`)}
              className="flex items-center gap-2 text-sm font-semibold text-primary"
            >
              {t("Explore")}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
const icons = [
  Wallet,
  CreditCard,
  House,
  Landmark,
  ShieldCheck,
  ArrowLeftRight,
];
export function PublicHomepage() {
  const { t, errorMessage } = useLocale();

  const query = usePublicHome();
  if (query.isPending)
    return (
      <p role="status" className="mx-auto max-w-6xl px-5 py-24">
        {t("Loading Aster Bank…")}
      </p>
    );
  if (query.isError) return <PublicError retry={() => void query.refetch()} />;
  const data = query.data;
  return (
    <>
      <section className="border-b bg-secondary px-5 py-14 md:py-20 lg:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-xs font-semibold tracking-[.16em] text-teal-800">
              {t(data.hero.eyebrow)}
            </p>
            <h1 className="mt-5 max-w-2xl text-4xl leading-[1.12] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              {t(data.hero.title)}
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">
              {t(data.hero.description)}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {data.hero.actions.map((action, index) => (
                <Button
                  key={action.label}
                  asChild
                  size="lg"
                  variant={index === 0 ? "default" : "outline"}
                >
                  {action.route === "/login" ? (
                    <CustomerEntry />
                  ) : (
                    <Link href={action.route}>
                      {t(action.label)}
                      {index === 0 ? (
                        <ArrowRight size={17} aria-hidden="true" />
                      ) : (
                        <Sparkles size={17} aria-hidden="true" />
                      )}
                    </Link>
                  )}
                </Button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-primary/10 bg-white p-7 sm:p-9">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground">
              {t("A CLEARER START")}
            </p>
            <h2 className="mt-4 text-2xl font-semibold">
              {t("What brings you here today?")}
            </h2>
            <div className="mt-6 divide-y">
              {data.serviceCategories
                .filter((_, index) => [0, 2, 3].includes(index))
                .map((item) => (
                  <Link
                    key={item.id}
                    href={item.route}
                    className="flex items-center justify-between gap-4 py-5 text-sm font-semibold"
                  >
                    {t(item.title)}
                    <ArrowUpRight
                      size={19}
                      className="shrink-0 text-teal-700"
                      aria-hidden="true"
                    />
                  </Link>
                ))}
            </div>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              {t("Explore at your own pace. No sign-in needed.")}
            </p>
          </div>
        </div>
      </section>
      <section
        aria-labelledby="services-title"
        className="mx-auto max-w-6xl px-5 py-14 lg:px-0"
      >
        <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-muted-foreground">
              {t("BANKING FOR EVERY DAY")}
            </p>
            <h2
              id="services-title"
              className="mt-3 text-3xl font-semibold tracking-tight"
            >
              {t("Find your next step")}
            </h2>
          </div>
          <Link
            href="/support"
            className="text-sm text-primary hover:underline"
          >
            {t("Need a hand? Visit support →")}
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.serviceCategories.map((item, index) => {
            const Icon = icons[index % icons.length];
            return (
              <Link
                key={item.id}
                href={item.route}
                className="group flex items-start gap-4 rounded-xl border p-5 transition-colors hover:bg-secondary"
              >
                <span className="rounded-lg bg-secondary p-2.5 text-primary">
                  <Icon size={21} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold">{t(item.title)}</h3>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {t(item.description)}
                  </p>
                </div>
                <ArrowUpRight
                  className="ml-auto shrink-0 text-muted-foreground"
                  size={17}
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      </section>
      <section
        className="bg-background px-5 py-14 lg:px-8"
        aria-labelledby="featured-title"
      >
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold tracking-widest text-muted-foreground">
            {t("GET TO KNOW ASTER")}
          </p>
          <h2 id="featured-title" className="mt-3 mb-3 text-3xl font-semibold">
            {t("Featured services")}
          </h2>
          <p className="mb-8 text-sm text-muted-foreground">
            {t(
              "Illustrative product guides. Explore the basics before taking a next step.",
            )}
          </p>
          <ContentCards items={data.featuredServices} />
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-14 lg:px-0">
        <div className="mb-7 flex items-center justify-between gap-4">
          <h2 className="text-3xl font-semibold">
            {t("A little more to explore")}
          </h2>
          <Link className="text-sm font-semibold text-primary" href="/offers">
            {t("All offers →")}
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {data.offers.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border bg-secondary/40 p-7"
            >
              <p className="text-xs font-semibold text-teal-800">
                {t(item.label)}
              </p>
              <h3 className="mt-3 text-2xl font-semibold">{t(item.title)}</h3>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                {t(item.description)}
              </p>
              <Link
                href={item.route}
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold"
              >
                {t("Explore offer")}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          ))}
        </div>
      </section>
      <section className="border-t px-5 py-14 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-7 flex items-center gap-3">
            <BookOpen size={24} className="text-teal-700" aria-hidden="true" />
            <h2 className="text-3xl font-semibold">{t("Insights & rates")}</h2>
          </div>
          <ContentCards items={data.insights} />
          <div className="mt-8 rounded-xl border bg-secondary/40 p-6">
            <h3 className="text-xl font-semibold">
              {t("Demo rates at a glance")}
            </h3>
            <p className="mt-3 text-sm">{t(data.rates.disclaimer)}</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              {data.rates.items
                .filter((rate) =>
                  ["usd-cny", "savings", "deposit"].includes(rate.id),
                )
                .map((rate) => (
                  <div key={rate.id}>
                    <p className="text-sm text-muted-foreground">
                      {t(rate.title)}
                    </p>
                    <p className="mt-2 text-xl font-semibold">
                      {t(rate.value)}
                      {t(" ")}
                      <span className="text-sm font-normal">
                        {t(rate.unit)}
                      </span>
                    </p>
                  </div>
                ))}
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              {t(data.rates.source)}
              {t(" · As of")}
              {t(data.rates.asOf)}
            </p>
            <Link
              href="/rates"
              className="mt-4 inline-block text-sm font-semibold underline"
            >
              {t("View illustrative rates →")}
            </Link>
          </div>
        </div>
      </section>
      <section className="px-5 pb-14 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 rounded-xl border border-teal-800/20 bg-secondary p-7 sm:flex-row sm:items-center">
          <ShieldCheck
            size={32}
            className="shrink-0 text-teal-800"
            aria-hidden="true"
          />
          <div className="flex-1">
            <h2 className="text-xl font-semibold">
              {t(data.securityNotice.title)}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {errorMessage(data.securityNotice)}
            </p>
          </div>
          <Link
            href={data.securityNotice.link.route}
            className="text-sm font-semibold text-primary underline"
          >
            {t(data.securityNotice.link.label)}
          </Link>
        </div>
      </section>
    </>
  );
}
