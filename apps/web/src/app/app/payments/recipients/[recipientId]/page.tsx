import { RecipientDetail } from "@/features/payments/recipient-management";
export default async function Page({
  params,
}: {
  params: Promise<{ recipientId: string }>;
}) {
  const { recipientId } = await params;
  return <RecipientDetail id={recipientId} />;
}
