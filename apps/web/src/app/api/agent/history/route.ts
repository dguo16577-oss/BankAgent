const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const cookie = request.headers.get("cookie");
  if (!cookie)
    return Response.json(
      { error: "Please sign in." },
      { status: 401, headers },
    );
  const id = new URL(request.url).searchParams.get("taskId");
  if (id !== null && !/^[a-f0-9]{32}$/.test(id))
    return Response.json({ error: "Invalid task." }, { status: 400, headers });
  try {
    const origin = new URL(
      process.env.ASTER_AGENT_RUNTIME_URL ?? "http://127.0.0.1:8001",
    );
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw new Error("Invalid configuration");
    const response = await fetch(
      new URL(id ? `/agent/history/${id}` : "/agent/history", origin),
      {
        headers: { Cookie: cookie, Accept: "application/json" },
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok)
      return Response.json(
        { error: "History could not be verified." },
        {
          status:
            response.status >= 400 && response.status < 600
              ? response.status
              : 502,
          headers,
        },
      );
    return Response.json(await response.json(), { headers });
  } catch {
    return Response.json(
      { error: "History is unavailable." },
      { status: 503, headers },
    );
  }
}
