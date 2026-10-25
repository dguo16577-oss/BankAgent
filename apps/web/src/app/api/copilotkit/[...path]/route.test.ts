import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { copilotThreadId } from "@/lib/agent/copilot-session";

const calls = vi.hoisted(() => ({ agents: [] as unknown[] }));
vi.mock("@ag-ui/client", () => ({
  HttpAgent: class {
    constructor(config: unknown) {
      calls.agents.push(config);
    }
  },
}));
vi.mock("@copilotkit/runtime/v2", () => ({
  CopilotRuntime: class {
    constructor() {}
  },
  createCopilotRuntimeHandler: () => async () => Response.json({ ok: true }),
}));

import { GET, POST } from "./route";

beforeEach(() => {
  vi.stubEnv("AGENT_UI_V2_ENABLED", "true");
  vi.stubEnv("ASTER_AGENT_RUNTIME_URL", "http://agent:8001");
  vi.stubEnv("ASTER_BANKING_CORE_URL", "http://bank:8080");
  calls.agents.length = 0;
  vi.spyOn(globalThis, "fetch")
    .mockReset()
    .mockImplementation(async () => Response.json({ authenticated: true }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function request(path: string, body?: unknown, cookie = "SESSION=alice") {
  return new Request(`http://localhost:3000/api/copilotkit/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Host: "localhost:3000",
      Origin: "http://localhost:3000",
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

it("rejects foreign, missing and inactive sessions before constructing an agent", async () => {
  expect((await GET(request("info", undefined, ""))).status).toBe(401);
  expect(
    (
      await POST(
        new Request("http://localhost:3000/api/copilotkit/agent/aster/run", {
          method: "POST",
          headers: { Origin: "http://attacker.test", Cookie: "SESSION=alice" },
          body: "{}",
        }),
      )
    ).status,
  ).toBe(403);
  vi.mocked(globalThis.fetch).mockResolvedValueOnce(
    Response.json({ authenticated: false }),
  );
  expect((await GET(request("info"))).status).toBe(401);
  expect(calls.agents).toHaveLength(0);
});

it("allows only the bank-session thread and uses a fresh per-request cookie agent", async () => {
  expect(
    (await POST(request("agent/aster/run", { threadId: "forged" }))).status,
  ).toBe(403);
  expect((await GET(request("threads"))).status).toBe(404);
  const threadId = copilotThreadId("SESSION=alice");
  expect((await POST(request("agent/aster/run", { threadId }))).status).toBe(
    200,
  );
  expect((await POST(request("agent/aster/run", { threadId }))).status).toBe(
    200,
  );
  expect(calls.agents).toEqual([
    {
      url: "http://agent:8001/agent/ag-ui",
      headers: { Cookie: "SESSION=alice" },
    },
    {
      url: "http://agent:8001/agent/ag-ui",
      headers: { Cookie: "SESSION=alice" },
    },
  ]);
});

it("rejects oversized SDK collections before constructing an HttpAgent", async () => {
  const threadId = copilotThreadId("SESSION=alice");
  expect(
    (
      await POST(
        request("agent/aster/run", { threadId, messages: Array(257).fill({}) }),
      )
    ).status,
  ).toBe(413);
  expect(calls.agents).toHaveLength(0);
});

it("retains the owned stop route with an empty body", async () => {
  const threadId = copilotThreadId("SESSION=alice");
  const result = await POST(
    new Request(
      `http://localhost:3000/api/copilotkit/agent/aster/stop/${threadId}`,
      {
        method: "POST",
        headers: { Origin: "http://localhost:3000", Cookie: "SESSION=alice" },
      },
    ),
  );
  expect(result.status).toBe(200);
});

it("rejects non-HTTP and credential-bearing origins even when the host matches", async () => {
  for (const origin of ["ftp://localhost:3000", "http://user@localhost:3000"]) {
    const result = await POST(
      new Request("http://localhost:3000/api/copilotkit/agent/aster/run", {
        method: "POST",
        headers: { Origin: origin, Cookie: "SESSION=alice" },
        body: "{}",
      }),
    );
    expect(result.status).toBe(403);
  }
  expect(calls.agents).toHaveLength(0);
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
