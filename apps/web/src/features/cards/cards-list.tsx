"use client";
import { useLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { useCards } from "./use-cards";
import { CardVisual, CardStatus, CardError } from "./card-presentation";
export function CardsList() {
  const { t, cardType } = useLocale();

  const query = useCards();
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm text-muted-foreground">{t("Your cards")}</p>
        <h1 className="text-3xl font-semibold">{t("Cards")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "Manage card access and review each change before it takes effect.",
          )}
        </p>
      </div>
      {query.isPending ? (
        <p role="status">{t("Loading cards…")}</p>
      ) : query.isError ? (
        <CardError error={query.error} retry={() => void query.refetch()} />
      ) : !query.data.items.length ? (
        <Card>
          <CardContent>
            <p>{t("No cards to display.")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          {query.data.items.map((card) => (
            <Link
              href={`/app/cards/${encodeURIComponent(card.id)}`}
              key={card.id}
              className="min-w-0 rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Card className="h-full shadow-none">
                <CardContent className="space-y-5">
                  <CardVisual card={card} />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-semibold">{card.displayName}</h2>
                    <CardStatus status={card.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t(card.scheme)} · {cardType(card.type)}
                  </p>
                  <p className="text-sm">
                    {t("Linked account · ")}
                    {card.linkedAccount.displayName}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
