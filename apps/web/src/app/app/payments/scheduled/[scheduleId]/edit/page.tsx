import { ScheduledDetail } from "@/features/payments/scheduled-payments";
export default async function Page({
  params,
}: {
  params: Promise<{ scheduleId: string }>;
}) {
  const { scheduleId } = await params;
  return <ScheduledDetail id={scheduleId} edit />;
}
