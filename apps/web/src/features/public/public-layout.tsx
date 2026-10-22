"use client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLocale } from "@/lib/i18n/locale";

import { CustomerEntry } from "./customer-entry";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Blocks,
  ChevronDown,
  Menu,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeaderSearch } from "./public-search";
import { usePublicNavigation } from "./use-public";
import type { components } from "@/generated/public-api";
type Group = components["schemas"]["PublicNavigationGroup"];
function GroupLinks({ group, close }: { group: Group; close: () => void }) {
  const { t } = useLocale();

  return (
    <>
      <Link
        href={group.route}
        onClick={close}
        className="mb-6 inline-flex items-center gap-2 font-semibold text-primary"
      >
        {t("Explore ")}
        {t(group.label)}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
      <div className="grid gap-7 md:grid-cols-3">
        {group.sections.map((section) => (
          <section key={section.label}>
            <h3 className="mb-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              {t(section.label)}
            </h3>
            <ul className="space-y-3">
              {section.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.route}
                    onClick={close}
                    className="text-sm hover:underline"
                  >
                    {t(link.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
export function PublicLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();

  const query = usePublicNavigation(),
    [open, setOpen] = useState<string | null>(null),
    [mobile, setMobile] = useState(false),
    header = useRef<HTMLElement>(null),
    trigger = useRef<HTMLButtonElement | null>(null);
  const close = () => {
    setOpen(null);
    setMobile(false);
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !header.current?.contains(event.target)
      ) {
        setOpen(null);
        setMobile(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const groups = query.data?.groups ?? [];
  return (
    <div className="min-h-screen bg-white">
      <a
        href="#public-content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-white focus:p-4"
      >
        {t("Skip to content")}
      </a>
      <header
        ref={header}
        className="relative z-30 border-b bg-white"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            close();
            trigger.current?.focus();
          }
        }}
      >
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-5 lg:px-8">
          <Link
            href="/"
            onClick={close}
            aria-label={t("Aster Bank home")}
            className="flex items-center gap-2.5 text-xl font-semibold tracking-tight"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-secondary text-primary">
              <Blocks size={21} aria-hidden="true" />
            </span>
            {t("Aster Bank")}
            <span className="text-teal-700">.</span>
          </Link>
          <nav
            aria-label={t("Public navigation")}
            className="hidden items-center gap-0.5 xl:flex"
          >
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                aria-expanded={open === group.id}
                aria-controls={`mega-${group.id}`}
                onClick={(event) => {
                  trigger.current = event.currentTarget;
                  setOpen(open === group.id ? null : group.id);
                }}
                className="flex items-center gap-1 rounded-md px-2 py-3 text-[13px] font-medium hover:bg-secondary"
              >
                {t(group.label)}
                <ChevronDown size={13} aria-hidden="true" />
              </button>
            ))}
          </nav>
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <LanguageSwitcher />
            <HeaderSearch />
            <Link
              href="/app/agent"
              onClick={close}
              className="hidden items-center gap-1.5 px-2 text-sm font-medium text-primary sm:flex"
            >
              <Sparkles size={16} aria-hidden="true" />
              {t("Ask Aster")}
            </Link>
            <Button asChild size="sm">
              <CustomerEntry name close={close} className="max-w-36 truncate" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="xl:hidden"
              aria-label={t(mobile ? "Close navigation" : "Open navigation")}
              aria-expanded={mobile}
              aria-controls="public-mobile-navigation"
              onClick={(event) => {
                trigger.current = event.currentTarget;
                setMobile(!mobile);
                setOpen(null);
              }}
            >
              {mobile ? (
                <X size={18} aria-hidden="true" />
              ) : (
                <Menu size={18} aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
        {query.isError && (
          <div
            role="alert"
            className="mx-auto flex max-w-6xl items-center gap-3 px-5 pb-4 text-sm"
          >
            {t("Navigation is temporarily unavailable.")}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void query.refetch()}
            >
              {t("Retry navigation")}
            </Button>
          </div>
        )}
        {t(
          open &&
            groups
              .filter((g) => g.id === open)
              .map((group) => (
                <div
                  key={group.id}
                  id={`mega-${group.id}`}
                  className="absolute inset-x-0 top-full hidden border-b bg-white shadow-lg xl:block"
                >
                  <div className="mx-auto grid max-w-6xl grid-cols-[240px_1fr] gap-12 px-8 py-9">
                    <div>
                      <p className="text-2xl font-semibold">{t(group.label)}</p>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {t(group.description)}
                      </p>
                    </div>
                    <div>
                      <GroupLinks group={group} close={close} />
                    </div>
                  </div>
                </div>
              )),
        )}
        {mobile && (
          <nav
            id="public-mobile-navigation"
            aria-label={t("Mobile public navigation")}
            className="max-h-[75vh] overflow-y-auto border-t px-5 pb-6 xl:hidden"
          >
            {query.isPending && (
              <p role="status" className="py-4">
                {t("Loading navigation…")}
              </p>
            )}
            {groups.map((group) => (
              <details key={group.id} className="border-b py-4">
                <summary className="cursor-pointer text-sm font-semibold">
                  {t(group.label)}
                </summary>
                <div className="pt-5">
                  <GroupLinks group={group} close={close} />
                </div>
              </details>
            ))}
            <Link
              href="/app/agent"
              onClick={close}
              className="mt-5 flex items-center gap-2 text-sm font-semibold"
            >
              <Sparkles size={17} aria-hidden="true" />
              {t("Ask Aster")}
            </Link>
          </nav>
        )}
      </header>
      <main id="public-content">{t(children)}</main>
      <footer className="bg-sidebar px-5 py-12 text-sidebar-foreground lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 md:grid-cols-[1fr_2fr]">
            <div>
              <Link href="/" className="text-xl font-semibold">
                {t("Aster Bank.")}
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-6 text-slate-300">
                {t(
                  "A clearer place to explore everyday banking and the choices ahead.",
                )}
              </p>
            </div>
            <nav
              aria-label={t("Footer navigation")}
              className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3"
            >
              {groups.map((group) => (
                <Link
                  key={group.id}
                  href={group.route}
                  className="hover:underline"
                >
                  {t(group.label)}
                </Link>
              ))}
              <Link href="/borrowing">{t("Borrowing")}</Link>
              <Link href="/support/recognise-phishing">{t("Security")}</Link>
              <Link href="/rates">{t("Rates")}</Link>
              <Link href="/fees">{t("Fees")}</Link>
              <a href="#public-legal">{t("Legal information")}</a>
            </nav>
          </div>
          <div
            id="public-legal"
            className="mt-10 space-y-3 border-t border-white/15 pt-7 text-xs leading-6 text-slate-300"
          >
            <p className="flex items-start gap-2">
              <ShieldCheck
                className="mt-1 shrink-0"
                size={15}
                aria-hidden="true"
              />
              {t(
                "Demo environment. Products, promotions and content are illustrative. No live rates or real banking services are provided.",
              )}
            </p>
            <p>© Aster Bank</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
