import type { paths } from "@/generated/customer-api";
import { apiGet } from "./client";

export type Overview =
  paths["/customer/overview"]["get"]["responses"][200]["content"]["application/json"];
export const getOverview = (signal?: AbortSignal) =>
  apiGet<Overview>("/customer/overview", signal);
