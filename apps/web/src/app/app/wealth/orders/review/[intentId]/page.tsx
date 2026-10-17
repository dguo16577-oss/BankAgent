import { InvestmentReview } from "@/features/wealth/investment-review";
export default async function Page({
  params,
}: {
  params: Promise<{ intentId: string }>;
}) {
  const values = await params;
  return <InvestmentReview {...values} />;
}
