import { InvestmentReceipt } from "@/features/wealth/investment-receipt";
export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const values = await params;
  return <InvestmentReceipt {...values} />;
}
