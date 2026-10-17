import { clearReceiptNavigation } from "@/lib/api/receipt-navigation";
import type { QueryClient, Query } from "@tanstack/react-query";
import { invalidateCustomerRevision } from "./customer-lifecycle";
export const isCustomerQuery = (query: Query) => query.queryKey[0] !== "public";
export async function clearCustomerCache(
  client: QueryClient,
  preserveSession = false,
) {
  invalidateCustomerRevision();
  clearReceiptNavigation();
  const predicate = (query: Query) =>
    isCustomerQuery(query) &&
    (!preserveSession || query.queryKey[0] !== "session");
  await client.cancelQueries({ predicate });
  client.removeQueries({ predicate });
  // Mutation variables may hold credentials or action grants. Public has no mutations.
  client.getMutationCache().clear();
}
