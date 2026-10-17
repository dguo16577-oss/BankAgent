export type ApiRuntime = { mode: "backend" | "mock"; baseUrl: string };
export function parseApiRuntime(
  mode = "backend",
  baseUrl?: string,
): ApiRuntime {
  if (mode !== "backend" && mode !== "mock")
    throw new Error("NEXT_PUBLIC_API_MODE must be backend or mock.");
  if (mode === "mock") return { mode, baseUrl: "" };
  if (!baseUrl)
    throw new Error(
      "NEXT_PUBLIC_BANKING_API_BASE_URL is required in backend mode.",
    );
  // Explicit same-origin deployment; an omitted value still fails closed.
  if (baseUrl === "/") return { mode, baseUrl: "" };
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Invalid Banking API base URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.replace(/\/$/, "")
  )
    throw new Error(
      "Banking API base URL must be an HTTP(S) origin without credentials, path, query or fragment.",
    );
  return { mode, baseUrl: url.origin };
}
export function apiRuntime(): ApiRuntime {
  // Static accesses are required for Next.js build-time public environment replacement.
  return parseApiRuntime(
    process.env.NEXT_PUBLIC_API_MODE,
    process.env.NEXT_PUBLIC_BANKING_API_BASE_URL,
  );
}
