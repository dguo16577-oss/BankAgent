import {
  activeBankSession,
  copilotThreadId,
} from "@/lib/agent/copilot-session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.AGENT_UI_V2_ENABLED !== "true")
    return new Response(null, { status: 404 });
  const cookie = request.headers.get("cookie");
  if (!cookie || !(await activeBankSession(cookie)))
    return new Response(null, { status: 401 });
  return Response.json(
    { threadId: copilotThreadId(cookie) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
