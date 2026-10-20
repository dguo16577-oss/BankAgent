import { HttpAgent } from "@ag-ui/client";
import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import {
  activeBankSession,
  copilotThreadId,
} from "@/lib/agent/copilot-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function fail(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: noStore });
}

function allowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return (
      new URL(origin).host ===
      (request.headers.get("host") ?? new URL(request.url).host)
    );
  } catch {
    return false;
  }
}

async function handler(request: Request) {
  if (process.env.AGENT_UI_V2_ENABLED !== "true")
    return fail(404, "Unavailable");
  if (
    !allowedOrigin(request) ||
    (request.method === "POST" && !request.headers.get("origin"))
  )
    return fail(403, "Origin rejected");
  const cookie = request.headers.get("cookie");
  if (!cookie) return fail(401, "Sign in required");
  const path = new URL(request.url).pathname;
  const threadId = copilotThreadId(cookie);
  const isInfo = path === "/api/copilotkit/info" && request.method === "GET";
  const isRun =
    path === "/api/copilotkit/agent/aster/run" && request.method === "POST";
  const isConnect =
    path === "/api/copilotkit/agent/aster/connect" && request.method === "POST";
  const isStop =
    path === `/api/copilotkit/agent/aster/stop/${threadId}` &&
    request.method === "POST";
  const isOwnedMessages =
    path === `/api/copilotkit/threads/${threadId}/messages` &&
    request.method === "GET";
  // CopilotKit's default in-memory runner also exposes thread listing and
  // mutation routes. None are needed for this experiment and none are public.
  if (!isInfo && !isRun && !isConnect && !isStop && !isOwnedMessages)
    return fail(404, "Unavailable");

  const agent = process.env.ASTER_AGENT_RUNTIME_URL;
  if (!agent) return fail(503, "Agent UI is not configured");
  if (!(await activeBankSession(cookie)))
    return fail(401, "Bank session is not active");
  // The runner's thread store is process-wide. Bind every run to an opaque
  // per-session thread before it reaches that store, including direct API use.
  if (isRun || isConnect) {
    const body: unknown = await request
      .clone()
      .json()
      .catch(() => undefined);
    if (
      !body ||
      typeof body !== "object" ||
      !("threadId" in body) ||
      body.threadId !== threadId
    )
      return fail(403, "Thread is not owned by this session");
  }

  // A fresh agent is constructed for this HTTP request. Never place a user's
  // session cookie in a module-level HttpAgent shared with another customer.
  const core = new CopilotRuntime({
    agents: {
      aster: new HttpAgent({
        url: new URL("/agent/ag-ui", agent).toString(),
        headers: { Cookie: cookie },
      }),
    },
  });
  const respond = createCopilotRuntimeHandler({
    runtime: core,
    basePath: "/api/copilotkit",
  });
  const response = await respond(request);
  response.headers.set("Cache-Control", "no-store, no-transform");
  return response;
}

export const GET = handler;
export const POST = handler;
