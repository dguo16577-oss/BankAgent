const noStore = { "Cache-Control": "no-store" };

export async function GET(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await context.params;
  if (!/^[a-f0-9]{32}$/.test(taskId))
    return Response.json(
      { error: "Invalid task" },
      { status: 400, headers: noStore },
    );
  const cookie = request.headers.get("cookie");
  if (!cookie)
    return Response.json(
      { error: "Sign in required" },
      { status: 401, headers: noStore },
    );
  const base = process.env.ASTER_AGENT_RUNTIME_URL;
  if (!base)
    return Response.json(
      { error: "Agent unavailable" },
      { status: 503, headers: noStore },
    );
  try {
    const upstream = await fetch(new URL(`/agent/tasks/${taskId}`, base), {
      headers: { Cookie: cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!upstream.ok)
      return Response.json(
        { error: "Task unavailable" },
        { status: upstream.status, headers: noStore },
      );
    return Response.json(await upstream.json(), { headers: noStore });
  } catch {
    return Response.json(
      { error: "Agent unavailable" },
      { status: 503, headers: noStore },
    );
  }
}
