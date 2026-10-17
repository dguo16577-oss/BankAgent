import { RecurringActionReview } from "@/features/spending/recurring-action-review";
export default async function Page({
  params,
}: {
  params: Promise<{ recurringPaymentId: string; intentId: string }>;
}) {
  const values = await params;
  return <RecurringActionReview {...values} />;
}
