const noStore = { "Cache-Control": "no-store" };

function error(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: noStore });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const browserHost =
      request.headers.get("host") ?? new URL(request.url).host;
    const parsed = new URL(origin);
    return (
      parsed.host === browserHost &&
      ["http:", "https:"].includes(parsed.protocol)
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return error("Request origin is not allowed.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return error("Expected a JSON request.", 415);
  const cookie = request.headers.get("cookie");
  if (!cookie) return error("Please sign in to use the assistant.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON request.", 400);
  }
  const action =
    body && typeof body === "object" && "action" in body ? body.action : "CHAT";
  if (action !== "CHAT" && action !== "CONFIRM" && action !== "CANCEL")
    return error("Unsupported Agent action.", 400);
  const taskId =
    body && typeof body === "object" && "taskId" in body
      ? body.taskId
      : undefined;
  if (
    taskId !== undefined &&
    (typeof taskId !== "string" || !/^[a-f0-9]{32}$/.test(taskId))
  )
    return error("Invalid Agent task.", 400);
  if (action !== "CHAT" && !taskId)
    return error("Agent task is required.", 400);
  const requestId =
    body && typeof body === "object" && "requestId" in body
      ? body.requestId
      : undefined;
  if (
    requestId !== undefined &&
    (action !== "CHAT" ||
      typeof requestId !== "string" ||
      !/^[a-f0-9]{32}$/.test(requestId))
  )
    return error("Invalid Agent request ID.", 400);
  const message =
    body && typeof body === "object" && "message" in body
      ? body.message
      : undefined;
  if (
    action === "CHAT" &&
    (typeof message !== "string" || !message.trim() || message.length > 2000)
  )
    return error("Enter a message of at most 2,000 characters.", 400);
  const intentId =
    body && typeof body === "object" && "intentId" in body
      ? body.intentId
      : undefined;
  const intentHash =
    body && typeof body === "object" && "intentHash" in body
      ? body.intentHash
      : undefined;
  const authorizationId =
    body && typeof body === "object" && "actionAuthorizationId" in body
      ? body.actionAuthorizationId
      : undefined;
  if (
    action === "CONFIRM" &&
    (typeof intentId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(intentId) ||
      typeof intentHash !== "string" ||
      !/^[a-fA-F0-9]{64}$/.test(intentHash) ||
      (authorizationId !== undefined &&
        (typeof authorizationId !== "string" ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(authorizationId))))
  )
    return error("Invalid transfer confirmation.", 400);
  const requestedLocale =
    body && typeof body === "object" && "locale" in body
      ? body.locale
      : "zh-CN";
  if (requestedLocale !== "en" && requestedLocale !== "zh-CN")
    return error("Unsupported locale.", 400);

  const base = process.env.ASTER_AGENT_RUNTIME_URL ?? "http://127.0.0.1:8001";
  let endpoint: URL;
  try {
    const parsed = new URL(base);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/"
    )
      throw new Error("Invalid Agent origin.");
    endpoint = new URL(
      action === "CHAT"
        ? "/agent/chat"
        : `/agent/tasks/${taskId}/${action === "CONFIRM" ? "confirm" : "cancel"}`,
      parsed,
    );
  } catch {
    return error("The assistant is not configured.", 503);
  }

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(
        action === "CHAT"
          ? {
              message: (message as string).trim(),
              locale: requestedLocale,
              ...(taskId ? { task_id: taskId } : {}),
              ...(requestId ? { request_id: requestId } : {}),
            }
          : action === "CONFIRM"
            ? {
                intent_id: intentId,
                intent_hash: intentHash,
                ...(authorizationId
                  ? { action_authorization_id: authorizationId }
                  : {}),
              }
            : {},
      ),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(300_000),
    });
    if (!upstream.ok) {
      const detail: unknown = await upstream.json().catch(() => undefined);
      const upstreamMessage =
        detail && typeof detail === "object" && "detail" in detail
          ? detail.detail
          : undefined;
      return error(
        typeof upstreamMessage === "string" && upstreamMessage.length <= 300
          ? upstreamMessage
          : "The assistant could not complete this request.",
        upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502,
      );
    }
    const result: unknown = await upstream.json().catch(() => undefined);
    if (
      !result ||
      typeof result !== "object" ||
      !("reply" in result || "message" in result) ||
      !(typeof ("reply" in result ? result.reply : result.message) === "string")
    )
      return error("The assistant returned an invalid response.", 502);
    return Response.json(result, { headers: noStore });
  } catch {
    return error("The assistant is unavailable. Please try again.", 503);
  }
}
