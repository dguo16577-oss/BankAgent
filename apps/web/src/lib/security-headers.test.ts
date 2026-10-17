import { expect, it } from "vitest";
import { securityHeaders } from "./security-headers";
it("restricts backend connections and frames without HSTS on local HTTP", () => {
  const headers = Object.fromEntries(
    securityHeaders("http://localhost:18080", true, false).map((h) => [
      h.key,
      h.value,
    ]),
  );
  expect(headers["Content-Security-Policy"]).toContain(
    "connect-src 'self' http://localhost:18080 ws://localhost:3000",
  );
  expect(headers["Content-Security-Policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  expect(headers["Strict-Transport-Security"]).toBeUndefined();
});
it("removes eval and development websocket permission for production and supports explicit HTTPS", () => {
  const headers = Object.fromEntries(
    securityHeaders("https://api.example.test", false, true).map((h) => [
      h.key,
      h.value,
    ]),
  );
  expect(headers["Content-Security-Policy"]).not.toContain("unsafe-eval");
  expect(headers["Content-Security-Policy"]).not.toContain("localhost");
  expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000");
});
