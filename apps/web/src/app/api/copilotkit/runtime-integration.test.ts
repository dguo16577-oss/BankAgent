import { afterEach, expect, it, vi } from "vitest";
import { copilotThreadId } from "@/lib/agent/copilot-session";
import { GET, POST } from "./[...path]/route";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("proxies a real CopilotKit v2 run to the AG-UI endpoint with only the bank session cookie", async () => {
  vi.stubEnv("AGENT_UI_V2_ENABLED", "true");
  vi.stubEnv("ASTER_AGENT_RUNTIME_URL", "http://agent.test");
  vi.stubEnv("ASTER_BANKING_CORE_URL", "http://bank.test");
  const calls: { url: string; cookie: string | null }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    const endpoint = String(url);
    const cookie = new Headers(options?.headers).get("cookie");
    calls.push({ url: endpoint, cookie });
    if (endpoint.startsWith("http://bank.test/"))
      return Response.json({ authenticated: true });
    if (endpoint === "http://agent.test/agent/ag-ui") {
      const body = JSON.parse(String(options?.body)) as {
        threadId: string;
        runId: string;
      };
      const events = [
        { type: "RUN_STARTED", threadId: body.threadId, runId: body.runId },
        { type: "TEXT_MESSAGE_START", messageId: "answer", role: "assistant" },
        {
          type: "TEXT_MESSAGE_CONTENT",
          messageId: "answer",
          delta: "Balance available",
        },
        { type: "TEXT_MESSAGE_END", messageId: "answer" },
        { type: "RUN_FINISHED", threadId: body.threadId, runId: body.runId },
      ];
      return new Response(
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }
    throw new Error(`Unexpected request: ${endpoint}`);
  });
  const common = {
    Host: "localhost:3000",
    Origin: "http://localhost:3000",
    Cookie: "SESSION=alice",
  };
  const info = await GET(
    new Request("http://localhost:3000/api/copilotkit/info", {
      headers: common,
    }),
  );
  expect(info.status).toBe(200);
  const threadId = copilotThreadId("SESSION=alice");
  const run = await POST(
    new Request("http://localhost:3000/api/copilotkit/agent/aster/run", {
      method: "POST",
      headers: { ...common, "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId,
        runId: "run-1",
        state: {},
        tools: [],
        context: [],
        messages: [{ id: "user-1", role: "user", content: "Show balance" }],
      }),
    }),
  );
  expect(run.status).toBe(200);
  expect(await run.text()).toContain("Balance available");
  expect(
    calls.some(
      (call) =>
        call.url === "http://agent.test/agent/ag-ui" &&
        call.cookie === "SESSION=alice",
    ),
  ).toBe(true);
});
