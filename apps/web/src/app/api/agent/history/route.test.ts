import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";
afterEach(() => vi.unstubAllGlobals());
it("forwards only authenticated read requests to the fixed history origin", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ tasks: [] }));
  vi.stubGlobal("fetch", fetcher);
  const response = await GET(
    new Request(`http://localhost/api/agent/history?taskId=${"a".repeat(32)}`, {
      headers: { Cookie: "SESSION=new" },
    }),
  );
  expect(response.status).toBe(200);
  expect(String(fetcher.mock.calls[0][0])).toBe(
    `http://127.0.0.1:8001/agent/history/${"a".repeat(32)}`,
  );
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    headers: { Cookie: "SESSION=new" },
    cache: "no-store",
    redirect: "manual",
  });
  expect(fetcher.mock.calls[0][1].body).toBeUndefined();
});
it("rejects missing cookies and arbitrary task URLs before upstream access", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(
    (await GET(new Request("http://localhost/api/agent/history"))).status,
  ).toBe(401);
  expect(
    (
      await GET(
        new Request(
          "http://localhost/api/agent/history?taskId=https://attacker",
          { headers: { Cookie: "SESSION=new" } },
        ),
      )
    ).status,
  ).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
