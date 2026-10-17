import { CardActionReceiptPage } from "@/features/cards/card-action-receipt";
export default async function Page({
  params,
}: {
  params: Promise<{ cardId: string; actionId: string }>;
}) {
  const { cardId, actionId } = await params;
  return <CardActionReceiptPage cardId={cardId} actionId={actionId} />;
}
