"use client";

import { Languages } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale";

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  return (
    <label className="inline-flex max-w-full shrink-0 items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm text-foreground">
      <Languages size={16} aria-hidden="true" />
      <span className="sr-only">Language / 语言</span>
      <select
        value={locale}
        onChange={(event) =>
          setLocale(event.target.value === "zh-CN" ? "zh-CN" : "en")
        }
        className="min-w-0 rounded-sm bg-transparent py-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <option value="en" lang="en">
          English
        </option>
        <option value="zh-CN" lang="zh-CN">
          简体中文
        </option>
      </select>
    </label>
  );
}
