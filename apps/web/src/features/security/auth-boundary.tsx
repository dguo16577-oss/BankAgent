"use client";
import { useLocale } from "@/lib/i18n/locale";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { sessionOptions } from "@/lib/api/session";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { clearCustomerCache } from "@/lib/api/customer-cache";
export function AuthBoundary({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();

  const query = useQuery(sessionOptions),
    client = useQueryClient(),
    router = useRouter();
  useEffect(() => {
    if (
      (query.error instanceof ApiError && query.error.status === 401) ||
      query.data?.authenticated === false
    ) {
      // A failed background Session refetch can retain its previous successful data.
      client
        .getQueryCache()
        .find({ queryKey: ["session"], exact: true })
        ?.setState({ data: undefined });
      void clearCustomerCache(client, true);
      const next = `&next=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`;
      router.replace(
        `/login?reason=${query.error instanceof ApiError && query.error.code === "SESSION_EXPIRED" ? "expired" : "signed-out"}${next}`,
      );
    }
  }, [query.error, query.data?.authenticated, client, router]);
  if (
    query.isPending ||
    (query.error instanceof ApiError && query.error.status === 401)
  )
    return (
      <main className="p-8" role="status">
        {t("Checking your session…")}
      </main>
    );
  if (query.isError)
    return (
      <main className="p-8">
        <p role="alert">{t("Session could not be checked.")}</p>
        <Button onClick={() => void query.refetch()}>{t("Retry")}</Button>
      </main>
    );
  if (!query.data?.authenticated) return null;
  return children;
}
export function SessionInvalidation() {
  const client = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    let navigating = false;
    const invalidate = (event: Event) => {
      if (navigating) return;
      navigating = true;
      const expired =
        (event as CustomEvent<string>).detail === "SESSION_EXPIRED";
      client
        .getQueryCache()
        .find({ queryKey: ["session"], exact: true })
        ?.setState({
          data: undefined,
          error: new ApiError(
            "Please sign in again.",
            401,
            "http",
            expired ? "SESSION_EXPIRED" : "UNAUTHENTICATED",
          ),
          status: "error",
          fetchStatus: "idle",
        });
      void clearCustomerCache(client, true);
      const reason =
        (event as CustomEvent<string>).detail === "SESSION_EXPIRED"
          ? "expired"
          : "signed-out";
      if (window.location.pathname.startsWith("/app/"))
        router.replace(
          `/login?reason=${reason}&next=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`,
        );
      navigating = false;
    };
    window.addEventListener("bank-session-invalid", invalidate);
    return () => window.removeEventListener("bank-session-invalid", invalidate);
  }, [client, router]);
  return null;
}
