import type { NextConfig } from "next";
import { parseApiRuntime } from "./src/lib/api/runtime";
import { securityHeaders } from "./src/lib/security-headers";
const runtime = parseApiRuntime(
  process.env.NEXT_PUBLIC_API_MODE,
  process.env.NEXT_PUBLIC_BANKING_API_BASE_URL,
);

const nextConfig: NextConfig = {
  // Bound build-worker memory on local development machines.
  experimental: { cpus: 2 },
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: process.cwd() + "/../..",
  productionBrowserSourceMaps: false,
  headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(
          runtime.baseUrl,
          process.env.NODE_ENV === "development",
          process.env.ASTER_HTTPS === "true",
        ),
      },
    ];
  },
};

export default nextConfig;
