import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { apiGet } from "./client";
import type { Session } from "./session";

describe("API client through MSW", () => {
  it("reads the contract-backed demo session", async () => {
    const result = await apiGet<Session>("/customer/session");
    expect(result.user).toEqual({
      id: "usr_aster_alex",
      displayName: "Alex Chen",
    });
  });
  it("normalizes HTTP errors", async () => {
    server.use(
      http.get(
        "/customer/session",
        () => new HttpResponse(null, { status: 503 }),
      ),
    );
    await expect(apiGet("/customer/session")).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
      kind: "http",
    });
  });
  it("normalizes network failures", async () => {
    server.use(http.get("/customer/session", () => HttpResponse.error()));
    await expect(apiGet("/customer/session")).rejects.toMatchObject({
      status: 0,
      kind: "network",
    });
  });
  it("normalizes malformed JSON", async () => {
    server.use(
      http.get("/customer/session", () => new HttpResponse("invalid json")),
    );
    await expect(apiGet("/customer/session")).rejects.toMatchObject({
      kind: "parse",
    });
  });
});
