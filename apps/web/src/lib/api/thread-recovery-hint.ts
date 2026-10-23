import { z } from "zod";

// Navigation/recovery hint only: never persist messages, bank data or terms.
const hintSchema = z
  .object({
    taskId: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
    status: z
      .enum([
        "RUNNING",
        "WAITING_USER",
        "WAITING_CONFIRMATION",
        "WAITING_AUTH",
        "BLOCKED",
        "BLOCKED_PROVIDER",
        "PARTIAL",
        "SUCCEEDED",
        "FAILED",
        "CANCELLED",
      ])
      .optional(),
    assistantCount: z.number().int().min(0).max(100000),
  })
  .strict();

function key(threadId: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(threadId))
    throw new Error("Invalid thread identifier");
  return `aster-agui-inflight-${threadId}`;
}

export function writeRecoveryHint(threadId: string, value: unknown) {
  const hint = hintSchema.parse(value);
  sessionStorage.setItem(key(threadId), JSON.stringify(hint));
}

export function readRecoveryHint(threadId: string) {
  const raw = sessionStorage.getItem(key(threadId));
  if (!raw) return undefined;
  try {
    return hintSchema.parse(JSON.parse(raw));
  } catch {
    sessionStorage.removeItem(key(threadId));
    return undefined;
  }
}
