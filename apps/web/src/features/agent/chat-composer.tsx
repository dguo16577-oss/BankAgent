"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale";

export function ChatComposer({
  id,
  value,
  onChange,
  onSubmit,
  disabled = false,
  busy = false,
  label,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
  placeholder?: string;
}) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const input = useRef<HTMLTextAreaElement>(null);
  const submitDisabled = disabled || busy || !value.trim();
  useEffect(() => {
    if (!input.current) return;
    input.current.style.height = "auto";
    input.current.style.height = `${Math.min(input.current.scrollHeight, 176)}px`;
  }, [value]);
  return (
    <form
      onSubmit={onSubmit}
      aria-busy={busy}
      className="sticky bottom-3 z-10 rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.2)] focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100 sm:p-4"
    >
      <label className="sr-only" htmlFor={id}>
        {label ?? (zh ? "你的消息" : "Your message")}
      </label>
      <textarea
        ref={input}
        id={id}
        rows={2}
        maxLength={2000}
        aria-label={label ?? (zh ? "你的消息" : "Your message")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing &&
            event.nativeEvent.keyCode !== 229
          ) {
            event.preventDefault();
            if (!submitDisabled) event.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder={placeholder ?? (zh ? "向 Aster 提问…" : "Message Aster…")}
        className="max-h-44 min-h-14 w-full resize-none border-0 bg-transparent px-2 py-1 text-[15px] leading-6 placeholder:text-slate-500 focus-visible:outline-none"
      />
      <div className="flex items-center justify-between gap-3 px-2 pt-2">
        <span className="text-[11px] text-slate-500">
          {value.length
            ? `${value.length}/2000`
            : zh
              ? "Enter 发送 · Shift + Enter 换行"
              : "Enter to send · Shift + Enter for a new line"}
        </span>
        <Button
          type="submit"
          size="icon"
          disabled={submitDisabled}
          className="rounded-full bg-slate-900 text-white hover:bg-teal-800"
          aria-label={zh ? "发送消息" : "Send message"}
        >
          {busy ? (
            <LoaderCircle
              className="motion-safe:animate-spin"
              aria-hidden="true"
            />
          ) : (
            <ArrowUp aria-hidden="true" />
          )}
        </Button>
      </div>
      <p className="mt-2 text-center text-xs text-slate-600">
        {zh
          ? "银行操作需要单独复核与确认"
          : "Bank actions require separate review and confirmation"}
      </p>
    </form>
  );
}
