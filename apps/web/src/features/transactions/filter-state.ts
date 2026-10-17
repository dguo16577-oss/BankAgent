import { isOffsetTime } from "@/lib/offset-time";
import type { TransactionFilters } from "@/lib/api/transactions";
import {
  categories,
  directions,
  statuses,
  types,
} from "@/lib/transaction-options";

export const filterKeys = [
  "search",
  "accountId",
  "cardId",
  "from",
  "to",
  "status",
  "direction",
  "type",
  "category",
] as const;
export function readFilters(params: URLSearchParams): {
  filters: TransactionFilters;
  error?: string;
} {
  const filters: TransactionFilters = {};
  for (const key of filterKeys)
    if (params.getAll(key).length > 1)
      return { filters, error: "A filter can only have one value." };
  for (const key of ["accountId", "cardId", "search"] as const) {
    const value = params.get(key)?.trim();
    if (value) filters[key] = value;
  }
  if ((filters.search?.length ?? 0) > 100)
    return { filters, error: "Search is limited to 100 characters." };
  const enums = {
    status: statuses,
    direction: directions,
    type: types,
    category: categories,
  };
  for (const key of ["status", "direction", "type", "category"] as const) {
    const value = params.get(key);
    if (value && !Object.hasOwn(enums[key], value))
      return {
        filters,
        error: `Invalid ${key} filter. Clear filters to start again.`,
      };
  }
  filters.status = (params.get("status") ||
    undefined) as TransactionFilters["status"];
  filters.direction = (params.get("direction") ||
    undefined) as TransactionFilters["direction"];
  filters.type = (params.get("type") ||
    undefined) as TransactionFilters["type"];
  filters.category = (params.get("category") ||
    undefined) as TransactionFilters["category"];
  for (const key of ["from", "to"] as const) {
    const value = params.get(key);
    if (!value) continue;
    if (isOffsetTime(value)) {
      filters[key] = value;
      continue;
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      return { filters, error: "Choose valid dates in YYYY-MM-DD format." };
    if (key === "from") filters.from = `${value}T00:00:00+08:00`;
    else {
      const nextDay = new Date(value);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      filters.to = `${nextDay.toISOString().slice(0, 10)}T00:00:00+08:00`;
    }
  }
  if (
    filters.from &&
    filters.to &&
    Date.parse(filters.from) >= Date.parse(filters.to)
  )
    return { filters, error: "From date must be on or before to date." };
  return { filters };
}
