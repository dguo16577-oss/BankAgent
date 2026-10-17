"use client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Card, CardContent } from "@/components/ui/card";
import { useLocale } from "@/lib/i18n/locale";
export default function Page() {
  const { t } = useLocale();
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-semibold">{t("Settings")}</h1>
      <p className="text-muted-foreground">
        {t("Manage your workspace preferences.")}
      </p>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-5">
          <div className="space-y-2">
            <h2 className="font-semibold">{t("Language")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("Choose your preferred display language.")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("Saved on this browser. You can change it at any time.")}
            </p>
          </div>
          <LanguageSwitcher />
        </CardContent>
      </Card>
    </section>
  );
}
