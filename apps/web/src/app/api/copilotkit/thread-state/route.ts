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
  const agent = process.env.ASTER_AGENT_RUNTIME_URL;
  if (!agent) return new Response(null, { status: 503 });
  try {
    const threadId = copilotThreadId(cookie);
    const upstream = await fetch(
      new URL(`/agent/ag-ui/thread-state/${threadId}`, agent),
      {
        headers: { Cookie: cookie },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!upstream.ok) return new Response(null, { status: upstream.status });
    const state: unknown = await upstream.json();
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return new Response(null, { status: 503 });
  }
}
