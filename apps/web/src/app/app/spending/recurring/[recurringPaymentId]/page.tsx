import { RecurringDetail } from "@/features/spending/recurring-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ recurringPaymentId: string }>;
}) {
  const values = await params;
  return <RecurringDetail {...values} />;
}
