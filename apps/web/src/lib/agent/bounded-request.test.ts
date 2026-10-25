import { expect, it } from "vitest";
import { boundedJsonRequest } from "./bounded-request";

function input(body: unknown) {
  return new Request("http://localhost/test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

it("preserves JSON bytes for the downstream SDK after bounded inspection", async () => {
  const body = {
    threadId: "owned",
    messages: [{ role: "user", content: "查询余额" }],
  };
  const result = await boundedJsonRequest(input(body));
  expect(result.body).toEqual(body);
  expect(await result.request.json()).toEqual(body);
});

it("rejects large declared bodies before consuming them", async () => {
  const request = input({});
  request.headers.set("Content-Length", "9999999");
  await expect(boundedJsonRequest(request)).rejects.toMatchObject({
    status: 413,
  });
  expect(request.bodyUsed).toBe(false);
});

it("counts actual streaming bytes even with a missing or misleading content length", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(300 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("http://localhost/test", {
    method: "POST",
    body: stream,
    headers: { "Content-Length": "1" },
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  await expect(boundedJsonRequest(request)).rejects.toMatchObject({
    status: 413,
  });
  expect(cancelled).toBe(true);
});

it("caps collection size before SDK schema issue accumulation", async () => {
  await expect(
    boundedJsonRequest(input({ messages: Array(257).fill({}) })),
  ).rejects.toMatchObject({ status: 413 });
});

it("bounds object depth and aggregate nodes independently", async () => {
  let deep: unknown = {};
  for (let i = 0; i < 34; i++) deep = { child: deep };
  await expect(boundedJsonRequest(input(deep))).rejects.toMatchObject({
    status: 413,
  });
  await expect(
    boundedJsonRequest(
      input(Array.from({ length: 256 }, () => Array(20).fill(0))),
    ),
  ).rejects.toMatchObject({ status: 413 });
});

it("rejects malformed JSON and allows an empty stop body only explicitly", async () => {
  await expect(
    boundedJsonRequest(
      new Request("http://localhost/test", { method: "POST", body: "{" }),
    ),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    boundedJsonRequest(
      new Request("http://localhost/test", { method: "POST" }),
    ),
  ).rejects.toMatchObject({ status: 400 });
  const stop = await boundedJsonRequest(
    new Request("http://localhost/test", { method: "POST" }),
    true,
  );
  expect(stop.body).toBeUndefined();
});
