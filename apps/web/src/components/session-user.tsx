"use client";
import { useLocale } from "@/lib/i18n/locale";

import { useQuery } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { sessionOptions } from "@/lib/api/session";

export function SessionUser() {
  const { t } = useLocale();

  const { data, isPending, isError, refetch } = useQuery(sessionOptions);
  if (isPending)
    return (
      <span role="status" className="text-sm text-muted-foreground">
        {t("Loading user…")}
      </span>
    );
  if (isError)
    return (
      <button onClick={() => void refetch()} className="text-sm underline">
        {t("Retry loading user")}
      </button>
    );
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-full bg-secondary text-primary">
        <UserRound size={18} aria-hidden="true" />
      </span>
      <span className="text-sm font-medium">{data.user.displayName}</span>
    </div>
  );
}
