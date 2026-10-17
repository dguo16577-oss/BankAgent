import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepareApiRuntime } from "./bootstrap";
const mock = vi.hoisted(() => ({ startMocking: vi.fn() }));
vi.mock("@/mocks/browser", () => mock);
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_MODE", "backend");
  vi.stubEnv("NEXT_PUBLIC_BANKING_API_BASE_URL", "http://localhost:18080");
  mock.startMocking.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});
it("backend initialization removes legacy mock storage without starting MSW", async () => {
  sessionStorage.setItem("aster-banking-state-v1", "financial state");
  sessionStorage.setItem("unrelated", "keep");
  await prepareApiRuntime();
  expect(sessionStorage.getItem("aster-banking-state-v1")).toBeNull();
  expect(sessionStorage.getItem("unrelated")).toBe("keep");
  expect(mock.startMocking).not.toHaveBeenCalled();
});
it("unregisters only the Aster mock worker", async () => {
  const own = {
    active: {
      scriptURL: "http://localhost:3000/mockServiceWorker.js",
      postMessage: vi.fn(),
    },
    waiting: null,
    installing: null,
    unregister: vi.fn(),
  };
  const other = {
    ...own,
    active: { ...own.active, scriptURL: "http://localhost:3000/other.js" },
    unregister: vi.fn(),
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { controller: null, getRegistrations: async () => [own, other] },
  });
  try {
    await prepareApiRuntime();
    expect(own.unregister).toHaveBeenCalledOnce();
    expect(other.unregister).not.toHaveBeenCalled();
    expect(mock.startMocking).not.toHaveBeenCalled();
  } finally {
    Reflect.deleteProperty(navigator, "serviceWorker");
  }
});
it("starts MSW only when explicitly selected", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_MODE", "mock");
  await prepareApiRuntime();
  expect(mock.startMocking).toHaveBeenCalledOnce();
});
it("invalid configuration fails instead of falling back", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_MODE", "invalid");
  await expect(prepareApiRuntime()).rejects.toThrow();
  expect(mock.startMocking).not.toHaveBeenCalled();
});
