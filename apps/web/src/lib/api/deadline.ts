export const API_TIMEOUT_MS = 20_000;

export class RequestTimeout extends Error {
  constructor() {
    super("The API request timed out. Please retry.");
    this.name = "RequestTimeout";
  }
}

// The deadline covers headers AND the response body. Cancellation also aborts fetch.
export async function withDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  caller?: AbortSignal | null,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(caller?.reason);
  if (caller?.aborted) cancel();
  else caller?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(
    () => controller.abort(new RequestTimeout()),
    API_TIMEOUT_MS,
  );
  let rejectAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason);
    if (controller.signal.aborted) rejectAbort();
    else
      controller.signal.addEventListener("abort", rejectAbort, { once: true });
  });
  try {
    return await Promise.race([aborted, work(controller.signal)]);
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}
