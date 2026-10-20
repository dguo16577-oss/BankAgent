import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { copilotThreadId } from "@/lib/agent/copilot-session";
import { GET } from "./route";

beforeEach(() => {
  vi.stubEnv("AGENT_UI_V2_ENABLED", "true");
  vi.stubEnv("ASTER_BANKING_CORE_URL", "http://bank.test");
  vi.stubEnv("ASTER_AGENT_RUNTIME_URL", "http://agent.test");
  vi.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function request(cookie = "SESSION=alice") {
  return new Request("http://localhost:3000/api/copilotkit/thread-state", {
    headers: { Cookie: cookie },
  });
}

it("checks the live bank session and fetches only the derived session thread", async () => {
  vi.mocked(globalThis.fetch)
    .mockResolvedValueOnce(Response.json({ authenticated: true }))
    .mockResolvedValueOnce(
      Response.json({
        task: { taskId: "a".repeat(32), status: "WAITING_CONFIRMATION" },
      }),
    );
  const response = await GET(request("SESSION=alice; XSRF-TOKEN=csrf"));
  expect(response.status).toBe(200);
  expect((await response.json()).task.status).toBe("WAITING_CONFIRMATION");
  expect(vi.mocked(globalThis.fetch).mock.calls[1][0].toString()).toBe(
    `http://agent.test/agent/ag-ui/thread-state/${copilotThreadId("SESSION=alice; XSRF-TOKEN=csrf")}`,
  );
  expect(vi.mocked(globalThis.fetch).mock.calls[1][1]?.headers).toEqual({
    Cookie: "SESSION=alice; XSRF-TOKEN=csrf",
  });
});

it("rejects missing, inactive and feature-disabled sessions", async () => {
  expect((await GET(request(""))).status).toBe(401);
  vi.mocked(globalThis.fetch).mockResolvedValueOnce(
    Response.json({ authenticated: false }),
  );
  expect((await GET(request())).status).toBe(401);
  vi.stubEnv("AGENT_UI_V2_ENABLED", "false");
  expect((await GET(request())).status).toBe(404);
});
