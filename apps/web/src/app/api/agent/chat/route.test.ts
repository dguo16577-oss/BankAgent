import { expect, it, vi } from "vitest";
import { POST } from "./route";
import fixture from "@/features/agent/__fixtures__/release-responses.json";

it("CONFIRM uses the actual chat proxy contract and returns an unwrapped receipt", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json(fixture.responses.completed));
  try {
    const result = await POST(
      new Request("http://localhost:3000/api/agent/chat", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          Host: "localhost:3000",
          Cookie: "SESSION=demo",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "CONFIRM",
          taskId: "a".repeat(32),
          intentId: "intent_one",
          intentHash: "b".repeat(64),
          actionAuthorizationId: "auth_one",
        }),
      }),
    );
    expect(result.status).toBe(200);
    expect(String(fetcher.mock.calls[0][0])).toMatch(
      /\/agent\/tasks\/a{32}\/confirm$/,
    );
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      intent_id: "intent_one",
      intent_hash: "b".repeat(64),
      action_authorization_id: "auth_one",
    });
    const raw = await result.json();
    expect(raw).not.toHaveProperty("task");
    expect(raw.receipt.id).toBe(fixture.responses.completed.receipt?.id);
  } finally {
    fetcher.mockRestore();
  }
});

it("cancels only the selected current intent through a fixed route without forwarding authorization", async () => {
  const previous = process.env.ASTER_AGENT_RUNTIME_URL;
  process.env.ASTER_AGENT_RUNTIME_URL = "http://127.0.0.1:8001";
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ message: "next review" }));
  try {
    const response = await POST(
      new Request("http://localhost:3000/api/agent/chat", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          Host: "localhost:3000",
          Cookie: "SESSION=demo",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "CANCEL_ACTION",
          taskId: "a".repeat(32),
          intentId: "intent_one",
          actionAuthorizationId: "must_not_forward",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(String(fetcher.mock.calls[0][0])).toBe(
      `http://127.0.0.1:8001/agent/tasks/${"a".repeat(32)}/cancel-action`,
    );
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      intent_id: "intent_one",
    });
  } finally {
    fetcher.mockRestore();
    if (previous === undefined) delete process.env.ASTER_AGENT_RUNTIME_URL;
    else process.env.ASTER_AGENT_RUNTIME_URL = previous;
  }
});

function request(origin = "http://localhost:3000", locale?: unknown) {
  return new Request("http://localhost:3000/api/agent/chat", {
    method: "POST",
    headers: {
      Origin: origin,
      Host: "localhost:3000",
      Cookie: "JSESSIONID=demo-session",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: "  show balance  ",
      ...(locale === undefined ? {} : { locale }),
    }),
  });
}

it("forwards only the signed-in cookie and message to the fixed Agent origin", async () => {
  const original = process.env.ASTER_AGENT_RUNTIME_URL;
  process.env.ASTER_AGENT_RUNTIME_URL = "http://127.0.0.1:8001";
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      reply: "Balance is available.",
      mode: "DETERMINISTIC",
      citations: [],
    }),
  );
  try {
    const response = await POST(request(undefined, "en"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:8001/agent/chat");
    expect(options?.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: "JSESSIONID=demo-session",
    });
    expect(options?.body).toBe(
      JSON.stringify({ message: "show balance", locale: "en" }),
    );
    expect(options?.redirect).toBe("manual");
  } finally {
    fetch.mockRestore();
    if (original === undefined) delete process.env.ASTER_AGENT_RUNTIME_URL;
    else process.env.ASTER_AGENT_RUNTIME_URL = original;
  }
});

it("forwards a stable chat request ID and rejects malformed IDs", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      Response.json({ reply: "Done", mode: "DETERMINISTIC", citations: [] }),
    );
  try {
    const withId = new Request("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        Host: "localhost:3000",
        Cookie: "SESSION=demo",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "给张三转10元",
        requestId: "a".repeat(32),
      }),
    });
    expect((await POST(withId)).status).toBe(200);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({
      request_id: "a".repeat(32),
    });
    fetch.mockClear();
    const malformed = new Request("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { Cookie: "SESSION=demo", "Content-Type": "application/json" },
      body: JSON.stringify({ message: "给张三转10元", requestId: "bad" }),
    });
    expect((await POST(malformed)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});

it("defaults older callers to Chinese and rejects unsupported languages", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      Response.json({ reply: "好的", mode: "DETERMINISTIC", citations: [] }),
    );
  try {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(fetch.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ message: "show balance", locale: "zh-CN" }),
    );
    fetch.mockClear();
    const rejected = await POST(request(undefined, "fr"));
    expect(rejected.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});

it("rejects requests from another browser origin before forwarding cookies", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  try {
    const response = await POST(request("https://evil.example"));
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});

it("forwards a structured confirmation to a fixed task path", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      task_id: "a".repeat(32),
      status: "SUCCEEDED",
      message: "Done",
      steps: [],
    }),
  );
  try {
    const response = await POST(
      new Request("http://localhost:3000/api/agent/chat", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          Host: "localhost:3000",
          Cookie: "SESSION=demo",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "CONFIRM",
          taskId: "a".repeat(32),
          intentId: "intent_1",
          intentHash: "b".repeat(64),
          actionAuthorizationId: "auth_1",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(String(fetch.mock.calls[0][0])).toBe(
      `http://127.0.0.1:8001/agent/tasks/${"a".repeat(32)}/confirm`,
    );
    expect(fetch.mock.calls[0][1]?.body).toBe(
      JSON.stringify({
        intent_id: "intent_1",
        intent_hash: "b".repeat(64),
        action_authorization_id: "auth_1",
      }),
    );
  } finally {
    fetch.mockRestore();
  }
});
