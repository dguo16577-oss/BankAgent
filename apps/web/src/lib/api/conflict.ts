import type { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";

export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

export async function refreshAfterConflict(
  client: QueryClient,
  error: unknown,
  keys: string[],
) {
  if (!isConflict(error)) return;
  await Promise.all(
    keys.map((key) => client.invalidateQueries({ queryKey: [key] })),
  );
}
