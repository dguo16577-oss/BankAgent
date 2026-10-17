import { TransferReview } from "@/features/payments/transfer-review";
export default async function Page({
  params,
}: {
  params: Promise<{ intentId: string }>;
}) {
  const { intentId } = await params;
  return <TransferReview intentId={intentId} />;
}
