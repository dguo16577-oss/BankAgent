import type {
  TransactionQuery,
  TransactionPage,
  TransactionDetail,
} from "@/lib/api/transactions";
import {
  statuses,
  directions,
  types,
  categories,
} from "@/lib/transaction-options";
import { demoTransactions, getDemoAccounts } from "./demo-profile";
import { compareTransactions } from "./transaction-fixtures";

export class TransactionQueryError extends Error {
  constructor(
    public readonly code: "INVALID_QUERY" | "INVALID_CURSOR",
    message: string,
  ) {
    super(message);
  }
}
const invalid = (message: string): never => {
  throw new TransactionQueryError("INVALID_QUERY", message);
};
const fields = [
  "accountId",
  "cardId",
  "from",
  "to",
  "status",
  "direction",
  "type",
  "category",
  "search",
  "cursor",
  "limit",
];
function timestamp(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    invalid("Dates must be ISO 8601 timestamps with an offset.");
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate()
  )
    invalid("Invalid calendar date.");
  return new Date(value).toISOString();
}
function enumValue<T extends string>(
  value: string | null,
  allowed: Record<T, string>,
): T | undefined {
  if (!value) return undefined;
  if (!Object.hasOwn(allowed, value))
    invalid("Unsupported transaction filter.");
  return value as T;
}
function parse(params: URLSearchParams): TransactionQuery {
  for (const name of params.keys())
    if (!fields.includes(name) || params.getAll(name).length !== 1)
      invalid("Unsupported or repeated query parameter.");
  const search = params.get("search")?.trim().toLowerCase() || undefined;
  if (search && search.length > 100)
    invalid("Search is limited to 100 characters.");
  const rawLimit = params.get("limit") ?? "10";
  if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 50)
    invalid("Limit must be between 1 and 50.");
  const from = params.get("from") ? timestamp(params.get("from")!) : undefined;
  const to = params.get("to") ? timestamp(params.get("to")!) : undefined;
  if (from && to && Date.parse(from) >= Date.parse(to))
    invalid("From must precede to.");
  return {
    accountId: params.get("accountId") || undefined,
    cardId: params.get("cardId") || undefined,
    from,
    to,
    status: enumValue(params.get("status"), statuses),
    direction: enumValue(params.get("direction"), directions),
    type: enumValue(params.get("type"), types),
    category: enumValue(params.get("category"), categories),
    search,
    limit: Number(rawLimit),
    cursor: params.get("cursor") || undefined,
  };
}

const encode = (value: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
function decode(cursor: string): unknown {
  if (cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor))
    throw new Error("Invalid token");
  const raw = atob(cursor.replaceAll("-", "+").replaceAll("_", "/"));
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(raw, (char) => char.charCodeAt(0)),
    ),
  );
}

export function queryDemoTransactions(
  params: URLSearchParams,
  records = demoTransactions,
  snapshot = "m3-demo-v1",
): TransactionPage {
  const { cursor, ...query } = parse(params);
  const signature = JSON.stringify(query);
  const matching = records
    .filter(
      (item) =>
        (!query.accountId || item.accountId === query.accountId) &&
        (!query.cardId || item.cardId === query.cardId) &&
        (!query.from ||
          Date.parse(item.occurredAt) >= Date.parse(query.from)) &&
        (!query.to || Date.parse(item.occurredAt) < Date.parse(query.to)) &&
        (!query.status || item.status === query.status) &&
        (!query.direction || item.direction === query.direction) &&
        (!query.type || item.type === query.type) &&
        (!query.category || item.category === query.category) &&
        (!query.search ||
          [item.title, item.merchant?.name, item.counterparty?.name].some(
            (value) => value?.toLowerCase().includes(query.search!),
          )),
    )
    .sort(compareTransactions);
  let candidates = matching;
  if (cursor) {
    try {
      const token = decode(cursor);
      if (
        typeof token !== "object" ||
        !token ||
        !("snapshot" in token) ||
        token.snapshot !== snapshot ||
        !("query" in token) ||
        token.query !== signature ||
        !("afterId" in token) ||
        typeof token.afterId !== "string"
      )
        throw new Error("Invalid token");
      const anchor = matching.find((item) => item.id === token.afterId);
      if (!anchor) throw new Error("Missing anchor");
      // Keyset continuation, never a page number or offset encoded in the token.
      candidates = matching.filter(
        (item) => compareTransactions(item, anchor) > 0,
      );
    } catch {
      throw new TransactionQueryError(
        "INVALID_CURSOR",
        "This cursor is invalid for the selected filters. Start a new query.",
      );
    }
  }
  const items = candidates.slice(0, query.limit);
  const hasMore = candidates.length > items.length;
  return structuredClone({
    items,
    hasMore,
    nextCursor: hasMore
      ? encode({ snapshot, query: signature, afterId: items.at(-1)!.id })
      : null,
  });
}

export function getDemoTransaction(
  id: string,
  records = demoTransactions,
  accounts = getDemoAccounts().accounts,
): TransactionDetail | undefined {
  const item = records.find((transaction) => transaction.id === id);
  if (!item) return undefined;
  const account = accounts.find((account) => account.id === item.accountId)!;
  return structuredClone({
    ...item,
    account,
    reference: item.reference ?? `ASTER-${item.id}`,
  });
}
