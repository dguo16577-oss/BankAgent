// Navigation hints only. Receipt reads remain authenticated by the backend.
// Never store a password, OTP or execution authorization here.
const prefix = "aster-receipt:";
export function rememberReceipt(intentId: string, path: string) {
  try {
    sessionStorage.setItem(prefix + intentId, path);
  } catch {
    /* Storage may be disabled. */
  }
}
export function receiptPath(intentId: string): string | undefined {
  try {
    const path = sessionStorage.getItem(prefix + intentId);
    return path?.startsWith("/app/") && !path.includes("\\") ? path : undefined;
  } catch {
    return undefined;
  }
}
export function clearReceiptNavigation() {
  if (typeof sessionStorage === "undefined") return;
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(prefix)) sessionStorage.removeItem(key);
  } catch {
    /* Storage may be disabled. */
  }
}
