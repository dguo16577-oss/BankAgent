import { TransferReceiptPage } from "@/features/payments/transfer-receipt";
export default async function Page({
  params,
}: {
  params: Promise<{ transferId: string }>;
}) {
  const { transferId } = await params;
  return <TransferReceiptPage transferId={transferId} />;
}
