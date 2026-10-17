import { CardDetailPage } from "@/features/cards/card-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  return <CardDetailPage cardId={cardId} />;
}
