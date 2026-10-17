export function getCsrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const value = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("XSRF-TOKEN="))
    ?.slice("XSRF-TOKEN=".length);
  return value ? decodeURIComponent(value) : undefined;
}
export function attachCsrfHeader(headers: Headers): void {
  const token = getCsrfToken();
  if (token) headers.set("X-XSRF-TOKEN", token);
}
