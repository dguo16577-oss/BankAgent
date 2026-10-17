/** Accept only same-origin relative page paths, never login loops or API routes. */
export function safeReturnPath(value?: string): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\s]/.test(value)
  )
    return "/";
  try {
    const url = new URL(value, "https://aster.invalid");
    if (
      url.origin !== "https://aster.invalid" ||
      /^\/(login|api)(\/|$)/.test(url.pathname)
    )
      return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
