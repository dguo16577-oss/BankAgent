import { createHash } from "node:crypto";

export function copilotThreadId(cookie: string) {
  const session = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => /^(SESSION|JSESSIONID)=/.test(part));
  if (!session) throw new Error("Bank session cookie is missing");
  // Session cookie is never returned. The opaque digest namespaces CopilotKit's
  // process-wide in-memory thread store by authenticated bank session.
  return createHash("sha256")
    .update("aster-copilot-thread-v1\0")
    .update(session)
    .digest("hex");
}

export async function activeBankSession(cookie: string) {
  const bank =
    process.env.ASTER_BANKING_CORE_URL ??
    process.env.NEXT_PUBLIC_BANKING_API_BASE_URL;
  if (!bank) return false;
  try {
    const response = await fetch(new URL("/customer/session", bank), {
      headers: { Cookie: cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const state: unknown = await response.json();
    return (
      !!state &&
      typeof state === "object" &&
      "authenticated" in state &&
      state.authenticated === true
    );
  } catch {
    return false;
  }
}
