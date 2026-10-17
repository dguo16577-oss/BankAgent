import { SecurityService } from "@/mocks/bank/security-service";
import { securityFixture } from "@/mocks/data/security-fixture";
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { bankingStore } from "@/mocks/bank/store";
import { server } from "@/mocks/server";

// jsdom has no layout observer. Actual chart sizing is exercised in Playwright.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

beforeEach(() => {
  bankingStore.reset();
  new SecurityService(bankingStore).login({
    email: securityFixture.email,
    password: securityFixture.password,
  });
});
