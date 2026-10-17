import { RecurringActionReceipt } from "@/features/spending/recurring-action-receipt";
export default async function Page({
  params,
}: {
  params: Promise<{ recurringPaymentId: string; actionId: string }>;
}) {
  const values = await params;
  return <RecurringActionReceipt {...values} />;
}
