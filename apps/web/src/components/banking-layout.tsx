"use client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLocale } from "@/lib/i18n/locale";

import { LogoutButton } from "@/features/security/login-form";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  ArrowLeft,
  Bell,
  Blocks,
  ChartNoAxesCombined,
  CreditCard,
  House,
  Landmark,
  Search,
  Settings,
  Sparkles,
  Wallet,
  ArrowLeftRight,
} from "lucide-react";
import { Button } from "./ui/button";
import { SessionUser } from "./session-user";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Overview", href: "/app/overview", icon: House },
  { name: "Accounts", href: "/app/accounts", icon: Wallet },
  { name: "Payments", href: "/app/payments", icon: ArrowLeftRight },
  { name: "Cards", href: "/app/cards", icon: CreditCard },
  { name: "Spending", href: "/app/spending", icon: ChartNoAxesCombined },
  { name: "Wealth", href: "/app/wealth", icon: Landmark },
  { name: "AI Agent", href: "/app/agent", icon: Sparkles },
  { name: "My applications", href: "/app/applications", icon: Landmark },
  { name: "Settings", href: "/app/settings", icon: Settings },
];

export function BankingLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();

  const pathname = usePathname();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-white focus:p-4"
      >
        {t("Skip to content")}
      </a>
      <aside className="flex flex-col bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:h-screen">
        <Link
          href="/app/overview"
          className="flex items-center gap-3 px-6 py-7 text-xl font-semibold tracking-tight"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-teal-300 text-slate-950">
            <Blocks size={21} aria-hidden="true" />
          </span>
          {t("Aster Bank")}
          <span className="text-teal-300">.</span>
        </Link>
        <div className="hidden px-6 pb-4 text-[10px] font-semibold tracking-[.2em] text-slate-400 lg:block">
          {t("YOUR WORKSPACE")}
        </div>
        <nav
          aria-label={t("Main navigation")}
          className="flex gap-1 overflow-x-auto px-3 pb-4 lg:flex-col"
        >
          {navigation.map(({ name, href, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-sm transition-colors hover:bg-white/10",
                  active
                    ? "bg-white/10 font-medium text-teal-200"
                    : "text-slate-300",
                )}
              >
                <Icon size={19} aria-hidden="true" />
                {t(name)}
                {active && (
                  <span className="ml-auto hidden size-1.5 rounded-full bg-teal-300 lg:block" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mx-5 mt-auto mb-6 hidden rounded-xl border border-white/10 p-4 lg:block">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Sparkles size={16} className="text-teal-300" aria-hidden="true" />
            {t("A foundation for more")}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            {t("A thoughtfully connected banking experience, taking shape.")}
          </p>
          <Link
            href="/app/agent"
            className="mt-4 flex items-center gap-2 text-xs text-teal-200"
          >
            {t("Explore AI Agent ")}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b bg-white px-5 py-4 lg:px-10">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Button asChild variant="outline" size="sm">
              <Link href="/">
                <ArrowLeft size={16} aria-hidden="true" />
                {t("Back to bank home")}
              </Link>
            </Button>
            <Link href="/" className="font-semibold text-foreground">
              {t("Aster Bank")}
            </Link>
            <span className="hidden sm:inline">
              {t("/ Personal workspace")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div
              aria-label={t("Search coming soon")}
              className="hidden items-center gap-2 text-sm text-muted-foreground xl:flex"
            >
              <Search size={17} aria-hidden="true" />
              {t("Search coming soon")}
            </div>
            <button
              disabled
              aria-label={t("Notifications coming soon")}
              className="text-muted-foreground"
            >
              <Bell size={19} aria-hidden="true" />
            </button>
            <LanguageSwitcher />
            <SessionUser />
            <LogoutButton />
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto max-w-7xl px-5 py-8 lg:px-10 lg:py-10"
        >
          {t(children)}
        </main>
        <footer className="mx-5 flex flex-wrap justify-between gap-2 border-t py-6 text-xs text-muted-foreground lg:mx-10">
          <span>{t("© Aster Bank · Demo workspace")}</span>
          <span>{t("Personal banking")}</span>
        </footer>
      </div>
    </div>
  );
}
