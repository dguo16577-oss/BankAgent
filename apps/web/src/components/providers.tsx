"use client";
import { useLocale } from "@/lib/i18n/locale";

import { SessionInvalidation } from "@/features/security/auth-boundary";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { prepareApiRuntime } from "@/lib/api/bootstrap";

export function Providers({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();

  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { mutations: { retry: false, gcTime: 0 } },
      }),
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  useEffect(() => {
    let active = true;
    async function prepare() {
      try {
        await prepareApiRuntime();
        if (active) setStatus("ready");
      } catch {
        if (active) setStatus("error");
      }
    }
    void prepare();
    return () => {
      active = false;
    };
  }, []);
  if (status === "error")
    return (
      <main className="grid min-h-screen place-content-center p-8" role="alert">
        {t(
          "API configuration could not be initialized. Check the runtime mode and reload this page.",
        )}
      </main>
    );
  if (status === "loading")
    return (
      <main
        className="grid min-h-screen place-content-center p-8"
        role="status"
      >
        {t("Preparing your workspace…")}
      </main>
    );
  return (
    <QueryClientProvider client={client}>
      <SessionInvalidation />
      {t(children)}
    </QueryClientProvider>
  );
}
