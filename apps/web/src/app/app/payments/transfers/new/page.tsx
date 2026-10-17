import { NewTransfer } from "@/features/payments/new-transfer";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ recipientId?: string }>;
}) {
  const { recipientId } = await searchParams;
  return <NewTransfer selectedRecipient={recipientId} />;
}
