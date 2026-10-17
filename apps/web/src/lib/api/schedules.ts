import type { components } from "@/generated/customer-api";
import { apiGet, apiPost } from "./client";
export type Schedule = components["schemas"]["ScheduledPayment"];
export type ScheduleIntent = components["schemas"]["ScheduleActionIntent"];
export type PrepareSchedule =
  components["schemas"]["PrepareScheduleActionRequest"];
export const getSchedules = (signal?: AbortSignal) =>
  apiGet<components["schemas"]["ScheduledPaymentsResponse"]>(
    "/customer/scheduled-payments",
    signal,
  );
export const getSchedule = (id: string, signal?: AbortSignal) =>
  apiGet<Schedule>(
    `/customer/scheduled-payments/${encodeURIComponent(id)}`,
    signal,
  );
export const prepareSchedule = (body: PrepareSchedule) =>
  apiPost<ScheduleIntent>("/customer/scheduled-payment-intents", body);
export const confirmSchedule = (
  intent: ScheduleIntent,
  key: string,
  actionAuthorizationId?: string,
) =>
  apiPost<Schedule>(
    "/customer/scheduled-payment-actions",
    {
      intentId: intent.id,
      intentHash: intent.intentHash,
      actionAuthorizationId,
    },
    { "Idempotency-Key": key },
  );
