import { TransactionDetailPage } from "@/features/transactions/transaction-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const { transactionId } = await params;
  return <TransactionDetailPage transactionId={transactionId} />;
}
