import { queryOptions } from "@tanstack/react-query";
import type { paths } from "@/generated/customer-api";
import { apiGet } from "./client";

export type Session =
  paths["/customer/session"]["get"]["responses"][200]["content"]["application/json"];
export const sessionOptions = queryOptions({
  queryKey: ["session"],
  queryFn: ({ signal }) => apiGet<Session>("/customer/session", signal),
  staleTime: 30_000,
  retry: false,
});
