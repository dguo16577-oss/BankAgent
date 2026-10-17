"use client";
import { useLocale } from "@/lib/i18n/locale";
import { PublicLayout } from "@/features/public/public-layout";
export default function Layout({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();

  return <PublicLayout>{t(children)}</PublicLayout>;
}
