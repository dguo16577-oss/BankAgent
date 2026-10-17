"use client";

import { useEffect, useSyncExternalStore } from "react";
import { formatDate as formatBankDate } from "@/lib/money";
import { chineseError } from "./errors";
import { zhCN } from "./messages";

export type Locale = "en" | "zh-CN";
export const localeStorageKey = "aster.locale";
const listeners = new Set<() => void>();
let memoryLocale: Locale = "en";
let storageUnavailable = false;

function snapshot(): Locale {
  if (storageUnavailable) return memoryLocale;
  try {
    const value = localStorage.getItem(localeStorageKey);
    return value === "zh-CN" ? "zh-CN" : "en";
  } catch {
    return memoryLocale;
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const sync = (event: StorageEvent) => {
    if (event.key === localeStorageKey || event.key === null) listener();
  };
  window.addEventListener("storage", sync);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", sync);
  };
}
function setLocale(locale: Locale) {
  memoryLocale = locale;
  try {
    localStorage.setItem(localeStorageKey, locale);
    storageUnavailable = false;
  } catch {
    storageUnavailable = true;
    // Preferences still work for this visit when browser storage is blocked.
  }
  listeners.forEach((listener) => listener());
}
const serverSnapshot = (): Locale => "en";

const normalizedMessages = new Map(
  Object.entries(zhCN).map(([key, value]) => [key.toLowerCase(), value]),
);
function translate<T>(value: T, locale: Locale, context?: string): T {
  if (locale === "en") return value;
  if (typeof value === "string") {
    const key = value.trim();
    const explore = key.match(/^Explore (.+)$/);
    const account = key.match(/^View (.+) account$/);
    const amount = key.match(/^Amount \(([^)]+)\)$/);
    const comparison = key.match(
      /^(.*%) vs (previous-month same-day range|comparison period)$/,
    );
    const balanceNote = key.match(
      /^Deposit accounts only · Demo FX: (.+) · Investments excluded$/,
    );
    const translated =
      (context ? zhCN[`${context}:${key}`] : undefined) ??
      zhCN[key] ??
      normalizedMessages.get(key.toLowerCase()) ??
      normalizedMessages.get(key.toLowerCase().replaceAll("_", " ")) ??
      (explore ? `了解${translate(explore[1], locale)}` : undefined) ??
      (account ? `查看 ${account[1]} 账户` : undefined) ??
      (amount ? `金额（${amount[1]}）` : undefined) ??
      (comparison
        ? `${comparison[1]} ${comparison[2] === "comparison period" ? "较比较期间" : "较上月同期"}`
        : undefined) ??
      (balanceNote
        ? `仅存款账户 · 演示汇率：${balanceNote[1]} · 不含投资`
        : undefined);
    return (translated ? value.replace(key, translated) : value) as T;
  }
  if (Array.isArray(value))
    return value.map((item: unknown) => translate(item, locale)) as T;
  return value;
}

export function useLocale() {
  const locale = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return {
    locale,
    setLocale,
    formatMonth: (timestamp: string) =>
      new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
        month: "short",
        year: "numeric",
        timeZone: "Asia/Shanghai",
      }).format(new Date(timestamp)),
    cardType: (type: string, english = type) =>
      locale === "zh-CN" ? (type === "DEBIT" ? "借记卡" : "信用卡") : english,
    formatDate: (timestamp: string, includeTime = false) =>
      formatBankDate(
        timestamp,
        includeTime,
        locale === "en" ? "en-GB" : locale,
      ),
    errorMessage: (error: { message?: string; code?: string }) =>
      locale === "en"
        ? error.message
        : (chineseError(error.code) ?? translate(error.message, locale)),
    t: <T,>(value: T, context?: string): T => translate(value, locale, context),
  };
}

export function LocaleDocument() {
  const { locale } = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title =
      locale === "zh-CN"
        ? "Aster Bank | 日常银行服务"
        : "Aster Bank | Everyday banking";
  }, [locale]);
  return null;
}
