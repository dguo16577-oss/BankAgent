import type { components } from "@/generated/customer-api";
type Code = components["schemas"]["ApiError"]["code"];
export class BankingError extends Error {
  constructor(
    public code: Code,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(code: Code, status: number, message: string): never {
  throw new BankingError(code, status, message);
}
export function record(
  body: unknown,
  allowed: string[],
  required: string[],
): asserts body is Record<string, unknown> {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(body, key))
  )
    fail("INVALID_REQUEST", 400, "Request fields do not match the contract.");
}
export async function hash(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
