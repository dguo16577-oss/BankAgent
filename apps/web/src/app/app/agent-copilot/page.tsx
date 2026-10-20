import { notFound } from "next/navigation";
import { CopilotWorkspace } from "@/features/agent/copilot-workspace";

export const dynamic = "force-dynamic";

export default function Page() {
  if (process.env.AGENT_UI_V2_ENABLED !== "true") notFound();
  return <CopilotWorkspace />;
}
