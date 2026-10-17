import type { components } from "@/generated/customer-api";
import { apiGet, apiPost } from "./client";
export type Application = components["schemas"]["ProductApplication"];
export type ApplicationRequest =
  components["schemas"]["PrepareApplicationIntentRequest"];
export type ApplicationIntent = components["schemas"]["ApplicationIntent"];
export type ApplicationSubmission =
  components["schemas"]["SubmitProductApplicationRequest"];
export const prepareApplication = (request: ApplicationRequest) =>
  apiPost<ApplicationIntent>("/customer/application-intents", request);
export const getApplications = (signal?: AbortSignal) =>
  apiGet<components["schemas"]["ProductApplicationsResponse"]>(
    "/customer/applications",
    signal,
  );
export const getApplication = (id: string, signal?: AbortSignal) =>
  apiGet<Application>(
    `/customer/applications/${encodeURIComponent(id)}`,
    signal,
  );
export const submitApplication = (
  request: ApplicationSubmission,
  key: string,
) =>
  apiPost<Application>("/customer/applications", request, {
    "Idempotency-Key": key,
  });
