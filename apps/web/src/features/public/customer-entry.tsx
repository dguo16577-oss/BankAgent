"use client";
import type { ComponentProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { sessionOptions } from "@/lib/api/session";
import { useLocale } from "@/lib/i18n/locale";
export function CustomerEntry({
  name = false,
  close,
  destination = "/app/overview",
  ...props
}: {
  name?: boolean;
  close?: () => void;
  destination?: string;
} & Omit<ComponentProps<typeof Link>, "href" | "onClick" | "name">) {
  const { data, isPending, isError } = useQuery(sessionOptions);
  const { t } = useLocale();
  const router = useRouter();
  return (
    <Link
      {...props}
      href={!isError && data?.authenticated ? destination : "/login"}
      onClick={(event) => {
        if (isError || !data?.authenticated) {
          event.preventDefault();
          router.push(
            `/login?next=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`,
          );
        }
        close?.();
      }}
    >
      {isPending
        ? t("Loading…")
        : !isError && data?.authenticated
          ? name
            ? data.user.displayName
            : t("My banking")
          : t("Sign in")}
    </Link>
  );
}
