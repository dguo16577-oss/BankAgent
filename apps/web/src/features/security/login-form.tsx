"use client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { apiRuntime } from "@/lib/api/runtime";
import { useLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { safeReturnPath } from "./return-path";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { sessionOptions } from "@/lib/api/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLogin, useLogout } from "./use-security";
import { clearCustomerCache } from "@/lib/api/customer-cache";
export function LoginForm({
  reason,
  next,
}: {
  reason?: string;
  next?: string;
}) {
  const destination = safeReturnPath(next);
  const { t, errorMessage } = useLocale();
  const mockMode = apiRuntime().mode === "mock";

  const auth = useLogin(),
    session = useQuery(sessionOptions),
    client = useQueryClient(),
    router = useRouter();
  const returned = useRef(false);
  useEffect(() => {
    if (!session.data?.authenticated || returned.current) return;
    returned.current = true;
    // Use a document navigation for fragments so the App Router cannot append a second hash.
    if (destination.includes("#")) window.location.replace(destination);
    else router.replace(destination);
  }, [session.data, router, destination]);
  return (
    <main className="grid min-h-screen place-items-center bg-secondary px-5 py-12">
      <Card className="w-full max-w-md shadow-none">
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t("Back to bank home")}
            </Link>
            <LanguageSwitcher />
          </div>
          <p className="text-lg font-semibold text-primary">
            {t("Aster Bank.")}
          </p>
          <div>
            <p className="text-xs tracking-widest text-muted-foreground">
              {t("DEMO ENVIRONMENT · SIMULATED_AUTH")}
            </p>
            <h1 className="mt-3 text-3xl font-semibold">
              {t("Welcome to Aster")}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              "Demo authentication environment. This local simulator does not connect to a real bank.",
            )}
          </p>
          {reason === "expired" && (
            <p role="alert">
              {t("Your session expired. Please sign in again.")}
            </p>
          )}
          {reason === "signed-out" && (
            <p role="status">{t("Please sign in to continue.")}</p>
          )}
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (auth.isPending) return;
              const element = event.currentTarget;
              const form = new FormData(element);
              try {
                const data = await auth.mutateAsync({
                  // Keep the frozen email payload while allowing a mock-only test alias.
                  email:
                    mockMode && form.get("email") === "admin"
                      ? "admin@aster.local"
                      : String(form.get("email")),
                  password: String(form.get("password")),
                });
                await clearCustomerCache(client);
                client.setQueryData(["session"], data);
              } catch {
                /* Inline error */
              } finally {
                const password = element.elements.namedItem("password");
                if (password instanceof HTMLInputElement) password.value = "";
                form.delete("password");
              }
            }}
          >
            <label className="block text-sm">
              {t("Email")}
              <input
                className="mt-2 w-full min-w-0 rounded-md border bg-background p-3"
                name="email"
                type={mockMode ? "text" : "email"}
                aria-describedby={mockMode ? "test-account-hint" : undefined}
                autoComplete="username"
                required
              />
            </label>
            {mockMode && (
              <p
                id="test-account-hint"
                className="text-xs text-muted-foreground"
              >
                {t("You can also enter the temporary test username admin.")}
              </p>
            )}
            <label className="block text-sm">
              {t("Password")}
              <input
                className="mt-2 w-full min-w-0 rounded-md border bg-background p-3"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {auth.isError && (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(auth.error)}
              </p>
            )}
            <Button className="w-full" disabled={auth.isPending}>
              {t(auth.isPending ? "Signing in…" : "Sign in to demo")}
            </Button>
          </form>
          <p className="break-words text-xs leading-5 text-muted-foreground">
            {t("Local test credentials are documented in")}
            {t(" ")}
            <code className="break-all">
              {t("docs/backend/authentication-session.md")}
            </code>
            {t(". Never use a real password here.")}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
export function LogoutButton() {
  const { t, errorMessage } = useLocale();

  const auth = useLogout(),
    client = useQueryClient(),
    router = useRouter();
  return (
    <div>
      {auth.isError && (
        <p role="alert" className="text-xs">
          {errorMessage(auth.error)}
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={auth.isPending}
        onClick={async () => {
          try {
            await auth.mutateAsync();
            await clearCustomerCache(client);
            router.replace("/login?reason=signed-out");
          } catch {
            /* Session invalidation handles 401. */
          }
        }}
      >
        {t(auth.isPending ? "Signing out…" : "Sign out")}
      </Button>
    </div>
  );
}
