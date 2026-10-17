import { CardActionReview } from "@/features/cards/card-action-review";
export default async function Page({
  params,
  searchParams,
}: {
  searchParams: Promise<{ challengeId?: string }>;
  params: Promise<{ cardId: string; intentId: string }>;
}) {
  const { cardId, intentId } = await params;
  const { challengeId } = await searchParams;
  return (
    <CardActionReview
      challengeId={challengeId}
      cardId={cardId}
      intentId={intentId}
    />
  );
}
