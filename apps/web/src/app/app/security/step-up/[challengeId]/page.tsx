import { StepUpPage } from "@/features/security/step-up-page";
export default async function Page({
  params,
}: {
  params: Promise<{ challengeId: string }>;
}) {
  const { challengeId } = await params;
  return <StepUpPage challengeId={challengeId} />;
}
