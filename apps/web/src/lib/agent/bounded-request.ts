/** Bound allocations before handing client JSON to the SDK's schemas. */
const MAX_BYTES = 256 * 1024;
const MAX_ITEMS = 256;
const MAX_NODES = 4096;
const MAX_DEPTH = 32;

export class RequestBoundError extends Error {
  constructor(public status: number) {
    super(status === 413 ? "Request is too large" : "Invalid JSON request");
  }
}

export async function boundedJsonRequest(request: Request, allowEmpty = false) {
  const advertised = request.headers.get("content-length");
  if (
    advertised &&
    (!/^\d+$/.test(advertised) || Number(advertised) > MAX_BYTES)
  )
    throw new RequestBoundError(413);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) {
          void reader.cancel().catch(() => undefined);
          throw new RequestBoundError(413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body: unknown;
  try {
    body =
      allowEmpty && size === 0
        ? undefined
        : JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new RequestBoundError(400);
  }
  const pending: { value: unknown; depth: number }[] = [
    { value: body, depth: 0 },
  ];
  let nodes = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++nodes > MAX_NODES || entry.depth > MAX_DEPTH)
      throw new RequestBoundError(413);
    if (entry.value && typeof entry.value === "object") {
      const values = Array.isArray(entry.value)
        ? entry.value
        : Object.values(entry.value);
      if (values.length > MAX_ITEMS) throw new RequestBoundError(413);
      for (const value of values)
        pending.push({ value, depth: entry.depth + 1 });
    }
  }
  return { body, request: new Request(request, { body: bytes.buffer }) };
}
