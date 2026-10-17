"use client";
import { useLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePublicSearch } from "./use-public";
import { PublicError } from "./public-homepage";
export function SearchResults({
  query,
  close,
}: {
  query: string;
  close?: () => void;
}) {
  const { t } = useLocale();

  const q = usePublicSearch(query);
  if (!query.trim())
    return (
      <p className="text-sm text-muted-foreground">
        {t("Search products, support articles and demo offers.")}
      </p>
    );
  if (q.isPending) return <p role="status">{t("Searching public content…")}</p>;
  if (q.isError) return <PublicError retry={() => void q.refetch()} />;
  return (
    <div aria-live="polite">
      <p className="mb-4 text-sm text-muted-foreground">
        {q.data.items.length}{" "}
        {t(q.data.items.length === 1 ? "result" : "results")}
        {t(" ")}
        {t("for “")}
        {t(q.data.query)}
        {t("” · Deterministic keyword search")}
      </p>
      <ul className="divide-y">
        {q.data.items.map((i) => (
          <li key={`${i.type}-${i.id}`} className="py-4">
            <p className="text-xs font-medium tracking-wide text-teal-800">
              {t(i.type.replaceAll("_", " "))}
            </p>
            <Link
              href={i.route}
              onClick={close}
              className="mt-2 inline-block font-semibold underline"
            >
              {t(i.title)}
            </Link>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t(i.summary)}
            </p>
          </li>
        ))}
      </ul>
      {!q.data.items.length && (
        <p>{t("No public results found. Try fewer words.")}</p>
      )}
    </div>
  );
}
export function PublicSearchBox({ close }: { close?: () => void }) {
  const { t } = useLocale();

  const [input, setInput] = useState(""),
    [query, setQuery] = useState("");
  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(input.trim());
        }}
        className="flex flex-wrap gap-3"
      >
        <label className="min-w-0 flex-1 text-sm font-medium">
          {t("Search public content")}
          <input
            autoComplete="off"
            type="search"
            maxLength={200}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="mt-2 w-full min-w-0 rounded-lg border p-3"
          />
        </label>
        <Button className="self-end" type="submit">
          {t("Search")}
        </Button>
      </form>
      <SearchResults query={query} close={close} />
    </div>
  );
}
export function HeaderSearch() {
  const { t } = useLocale();

  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    dialog.current?.close();
    trigger.current?.focus();
  };
  return (
    <>
      <Button
        ref={trigger}
        size="icon"
        variant="outline"
        aria-label={t("Search public website")}
        onClick={() => dialog.current?.showModal()}
      >
        <Search size={17} aria-hidden="true" />
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="public-search-title"
        className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border bg-white p-5 shadow-xl backdrop:bg-black/40 sm:p-8"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key !== "Tab") return;
          const controls = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
            ),
          ).filter((element) => element.getClientRects().length > 0);
          const first = controls[0],
            last = controls.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 id="public-search-title" className="text-2xl font-semibold">
            {t("Search Aster")}
          </h2>
          <Button
            size="icon"
            variant="outline"
            aria-label={t("Close search")}
            onClick={close}
          >
            <X size={18} />
          </Button>
        </div>
        <PublicSearchBox close={close} />
      </dialog>
    </>
  );
}
