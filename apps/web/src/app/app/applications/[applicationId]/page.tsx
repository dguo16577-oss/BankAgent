import { ApplicationDetail } from "@/features/applications/application-pages";
export default async function Page({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  return <ApplicationDetail id={applicationId} />;
}
