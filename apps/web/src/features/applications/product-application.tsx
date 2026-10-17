"use client";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { sessionOptions } from "@/lib/api/session";
import { ApiError } from "@/lib/api/client";
import { useLocale } from "@/lib/i18n/locale";
import { Button } from "@/components/ui/button";
import { ApplicationForm, ApplicationDetail } from "./application-pages";
import { useApplications } from "./use-applications";

function ExistingOrNewApplication({ productId }: { productId: string }) {
  const query = useApplications();
  const { t } = useLocale();
  if (query.isPending) return <p role="status">{t("Loading…")}</p>;
  if (query.isError)
    return (
      <div role="alert">
        <p>{t("Unable to load application options.")}</p>
        <Button onClick={() => void query.refetch()}>{t("Retry")}</Button>
      </div>
    );
  const existing = query.data.items.find(
    (item) => item.productId === productId,
  );
  return existing ? (
    <ApplicationDetail id={existing.id} inline />
  ) : (
    <ApplicationForm productId={productId} inline />
  );
}

export function ProductApplication({ productId }: { productId: string }) {
  const session = useQuery(sessionOptions);
  const { t } = useLocale();
  const router = useRouter();
  return (
    <section
      id="apply"
      className="scroll-mt-24 rounded-xl border bg-background p-6"
    >
      {session.isPending ? (
        <p role="status">{t("Checking your session…")}</p>
      ) : session.isError &&
        !(session.error instanceof ApiError && session.error.status === 401) ? (
        <div role="alert">
          <p>{t("Session could not be checked.")}</p>
          <Button onClick={() => void session.refetch()}>{t("Retry")}</Button>
        </div>
      ) : !session.isError && session.data?.authenticated ? (
        <ExistingOrNewApplication key={productId} productId={productId} />
      ) : (
        <Button
          onClick={() =>
            router.push(
              `/login?next=${encodeURIComponent(window.location.pathname + window.location.search + "#apply")}`,
            )
          }
        >
          {t("Sign in")}
        </Button>
      )}
    </section>
  );
}
